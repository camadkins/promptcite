// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, writeFileSync as wf, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalize, computeHash, runVerify, validateSchema, formatReport } from '../bin/verify.js';

const example = {
  schema_version: '1.0',
  generated_at: '2026-05-14T16:32:00Z',
  metadata_source: 'agent_reported',
  student: 'C. Hawkins',
  assignment: { course: 'ENGL 251', instructor: 'Dr. Martinez', title: 'Policy Analysis Essay' },
  ai_use: {
    tool: 'ChatGPT',
    model: 'GPT-4o',
    date: '2026-05-14',
    category: 'brainstorm',
    prompt_summary: 'Asked for five counterarguments to carbon tax policies',
    direct_content_used: false,
    revision_statement: 'Used the list to structure my own outline; rewrote all arguments in my own words.',
    source_verification: null,
  },
  outputs: {
    citation_mla: 'x',
    citation_apa: 'y',
    citation_chicago: 'z',
    disclosure_statement: 'd',
  },
};

test('canonicalize sorts object keys', () => {
  const out = canonicalize({ b: 1, a: 2 });
  assert.equal(out, '{"a":2,"b":1}');
});

test('canonicalize handles nested objects', () => {
  const out = canonicalize({ b: { d: 1, c: 2 }, a: 'x' });
  assert.equal(out, '{"a":"x","b":{"c":2,"d":1}}');
});

test('canonicalize handles arrays without sorting', () => {
  const out = canonicalize([3, 1, 2]);
  assert.equal(out, '[3,1,2]');
});

test('canonicalize handles null', () => {
  assert.equal(canonicalize(null), 'null');
});

test('canonicalize handles primitives', () => {
  assert.equal(canonicalize(42), '42');
  assert.equal(canonicalize('hi'), '"hi"');
  assert.equal(canonicalize(true), 'true');
});

test('computeHash ignores content_hash field in input', () => {
  const h1 = computeHash(example);
  const h2 = computeHash({ ...example, content_hash: 'whatever' });
  assert.equal(h1, h2);
});

test('computeHash returns 64 lowercase hex chars', () => {
  const h = computeHash(example);
  assert.match(h, /^[a-f0-9]{64}$/);
});

test('computeHash is deterministic across calls', () => {
  const h1 = computeHash(example);
  const h2 = computeHash(example);
  assert.equal(h1, h2);
});

test('computeHash differs when content changes', () => {
  const h1 = computeHash(example);
  const h2 = computeHash({ ...example, student: 'Different Person' });
  assert.notEqual(h1, h2);
});

async function withTempReceipt(receipt, fn) {
  // mkdtempSync creates a unique directory with 0o700 perms, avoiding
  // the symlink-attack window of constructing a path in tmpdir() and
  // writing to it.
  const dir = mkdtempSync(join(tmpdir(), 'pc-test-'));
  const path = join(dir, 'receipt.json');
  writeFileSync(path, JSON.stringify(receipt));
  try {
    return await fn(path);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

test('runVerify returns 0 for matching hash', async () => {
  const hash = computeHash(example);
  const receipt = { ...example, content_hash: hash };
  const code = await withTempReceipt(receipt, (path) => runVerify([path]));
  assert.equal(code, 0);
});

test('runVerify returns 1 for mismatched hash', async () => {
  const receipt = { ...example, content_hash: 'a'.repeat(64) };
  const code = await withTempReceipt(receipt, (path) => runVerify([path]));
  assert.equal(code, 1);
});

test('runVerify returns 2 for null hash', async () => {
  const receipt = { ...example, content_hash: null };
  const code = await withTempReceipt(receipt, (path) => runVerify([path]));
  assert.equal(code, 2);
});

test('runVerify returns 2 for missing hash field', async () => {
  const code = await withTempReceipt(example, (path) => runVerify([path]));
  assert.equal(code, 2);
});

test('runVerify returns 3 for missing file', async () => {
  const code = await runVerify(['/nonexistent/path.json']);
  assert.equal(code, 3);
});

test('runVerify returns 3 for malformed hash', async () => {
  const receipt = { ...example, content_hash: 'not-a-real-hash' };
  const code = await withTempReceipt(receipt, (path) => runVerify([path]));
  assert.equal(code, 3);
});

test('runVerify returns 0 with --help', async () => {
  assert.equal(await runVerify(['--help']), 0);
  assert.equal(await runVerify(['-h']), 0);
});

test('runVerify returns 0 with no args (shows help)', async () => {
  assert.equal(await runVerify([]), 0);
});

test('example brainstorm-receipt.json has a matching hash', async () => {
  const path = new URL('../examples/brainstorm-receipt.json', import.meta.url).pathname;
  const code = await runVerify([path]);
  assert.equal(code, 0);
});

// --- schema validation (feature B) ---

test('validateSchema accepts a valid receipt', () => {
  assert.deepEqual(validateSchema(example), []);
});

test('validateSchema accepts optional 1.1 fields', () => {
  const r = {
    ...example,
    schema_version: '1.1',
    submission_hash: 'b'.repeat(64),
    outputs: { ...example.outputs, citation_ieee: 'i', citation_harvard: 'h' },
  };
  assert.deepEqual(validateSchema(r), []);
});

test('validateSchema flags a missing required field', () => {
  const { student, ...rest } = example;
  const errs = validateSchema(rest);
  assert.ok(errs.some((e) => e.includes('student')));
});

test('validateSchema flags a bad category enum', () => {
  const r = { ...example, ai_use: { ...example.ai_use, category: 'vibes' } };
  const errs = validateSchema(r);
  assert.ok(errs.some((e) => e.includes('category')));
});

test('validateSchema flags a malformed submission_hash', () => {
  const r = { ...example, submission_hash: 'nope' };
  const errs = validateSchema(r);
  assert.ok(errs.some((e) => e.includes('submission_hash')));
});

test('runVerify returns 4 for matching hash but invalid schema', async () => {
  // Remove a required field, then stamp the matching hash. computeHash
  // excludes content_hash/submission_hash, so the stored hash still matches.
  const { student, ...invalid } = example;
  const receipt = { ...invalid, content_hash: computeHash(invalid) };
  const code = await withTempReceipt(receipt, (path) => runVerify([path]));
  assert.equal(code, 4);
});

test('computeHash excludes submission_hash from the digest', () => {
  const h1 = computeHash(example);
  const h2 = computeHash({ ...example, submission_hash: 'c'.repeat(64) });
  assert.equal(h1, h2);
});

test('formatReport summarizes key fields', () => {
  const report = formatReport(example, 'INTACT', []);
  assert.match(report, /C\. Hawkins/);
  assert.match(report, /Policy Analysis Essay/);
  assert.match(report, /INTACT/);
  assert.match(report, /Schema:\s+\d+\.\d+ — VALID/);  // the generation is part of the report
});

// ---------------------------------------------------------------------------
// Schema 2.0 — ai_use is an array of sessions, and 1.x must keep working
// ---------------------------------------------------------------------------

const session = (over = {}) => ({
  tool: 'ChatGPT',
  model: 'GPT-4o',
  date: '2026-05-14',
  metadata_source: 'agent_reported',
  category: 'outline',
  prompt_summary: 'Asked for an essay structure',
  direct_content_used: false,
  revision_statement: 'Rewrote every heading myself.',
  source_verification: null,
  citations: { mla: 'm', apa: 'a', chicago: 'c' },
  ...over,
});

const v2 = (sessions = [session()]) => ({
  schema_version: '2.0',
  generated_at: '2026-05-16T18:04:00Z',
  student: 'C. Hawkins',
  assignment: { course: 'ENGL 251', instructor: 'Dr. Martinez', title: 'Policy Analysis Essay' },
  ai_use: sessions,
  outputs: { disclosure_statement: 'I used AI as described above.' },
});

test('a 2.0 receipt validates', () => {
  assert.deepEqual(validateSchema(v2()), []);
});

test('a 2.0 receipt with several sessions validates', () => {
  const errs = validateSchema(v2([
    session(),
    session({ tool: 'Claude', date: '2026-05-16', category: 'debug', metadata_source: 'student_claimed' }),
  ]));
  assert.deepEqual(errs, []);
});

test('a 1.1 receipt still validates — an older receipt is not malformed', () => {
  assert.deepEqual(validateSchema(example), []);
});

test('2.0 rejects ai_use as an object', () => {
  const r = { ...v2(), ai_use: session() };
  assert.match(validateSchema(r).join('\n'), /ai_use must be an array/);
});

test('2.0 rejects an empty session list — a receipt with no sessions is not a receipt', () => {
  assert.match(validateSchema(v2([])).join('\n'), /at least one session/);
});

test('2.0 reports the index of the offending session', () => {
  const errs = validateSchema(v2([session(), session({ category: 'vibes' })])).join('\n');
  assert.match(errs, /ai_use\[1\]\.category/);
  assert.doesNotMatch(errs, /ai_use\[0\]\.category/);
});

test('2.0 requires metadata_source on every session', () => {
  const errs = validateSchema(v2([session(), session({ metadata_source: undefined })])).join('\n');
  assert.match(errs, /ai_use\[1\]\.metadata_source/);
});

test('2.0 requires the three core citations per session', () => {
  const errs = validateSchema(v2([session({ citations: { mla: 'm' } })])).join('\n');
  assert.match(errs, /ai_use\[0\]\.citations\.apa/);
  assert.match(errs, /ai_use\[0\]\.citations\.chicago/);
});

test('2.0 accepts optional ieee and harvard citations, rejects empty ones', () => {
  assert.deepEqual(validateSchema(v2([session({ citations: { mla: 'm', apa: 'a', chicago: 'c', ieee: 'i', harvard: 'h' } })])), []);
  const errs = validateSchema(v2([session({ citations: { mla: 'm', apa: 'a', chicago: 'c', ieee: '' } })])).join('\n');
  assert.match(errs, /citations\.ieee, when present/);
});

test('2.0 does not require the 1.x top-level metadata_source', () => {
  const errs = validateSchema(v2()).join('\n');
  assert.doesNotMatch(errs, /^metadata_source/m);
});

test('content_hash round-trips over the array shape', () => {
  const r = v2([session(), session({ tool: 'Claude', date: '2026-05-16' })]);
  r.content_hash = computeHash(r);
  assert.deepEqual(validateSchema(r), []);
  assert.equal(computeHash(r), r.content_hash, 'hash excludes itself, so recomputation matches');
});

test('reordering sessions changes the hash — session order is part of the record', () => {
  const s1 = session();
  const s2 = session({ tool: 'Claude', date: '2026-05-16' });
  assert.notEqual(computeHash(v2([s1, s2])), computeHash(v2([s2, s1])));
});

test('formatReport lists every session with its own provenance', () => {
  const report = formatReport(v2([
    session(),
    session({ tool: 'Claude', date: '2026-05-16', metadata_source: 'student_claimed' }),
  ]), 'INTACT', []);
  assert.match(report, /Session 1:.*ChatGPT/);
  assert.match(report, /Session 2:.*Claude/);
  assert.match(report, /agent-reported/);
  assert.match(report, /student-claimed/);
  assert.match(report, /Schema:\s+2\.0 — VALID/);
});

test('formatReport never totals the sessions — a count is not a severity score', () => {
  const report = formatReport(v2([session(), session(), session()]), 'INTACT', []);
  assert.doesNotMatch(report, /\b3 sessions\b/);
  assert.doesNotMatch(report, /total/i);
});

test('formatReport renders a 1.x receipt with its top-level provenance', () => {
  const report = formatReport(example, 'INTACT', []);
  assert.match(report, /AI use:\s+ChatGPT/);
  assert.match(report, /agent-reported/);
});

/** A 2.1 receipt: one session, carrying an attestation. */
const attested = {
  schema_version: '2.1',
  generated_at: '2026-08-24T16:32:00Z',
  content_hash: null,
  submission_hash: null,
  student: 'C. Hawkins',
  assignment: { course: 'CSCE 423', instructor: 'Dr. Reed', title: 'Problem Set 3' },
  ai_use: [{
    tool: 'Claude',
    model: 'Claude Opus 5',
    date: '2026-08-24',
    metadata_source: 'agent_reported',
    category: 'debug',
    prompt_summary: 'Asked why my memoized LCS returned one less than expected',
    direct_content_used: true,
    revision_statement: 'Fixed the loop bound myself once I understood it.',
    source_verification: null,
    citations: { mla: 'a', apa: 'b', chicago: 'c', ieee: 'd', harvard: 'e' },
    verification: {
      attested: true,
      statement: 'Traced the base cases by hand and tested n=0 and both-empty.',
    },
  }],
  outputs: { disclosure_statement: 'd' },
};

test('a 2.1 receipt validates on the 2.0 array shape', () => {
  assert.deepEqual(validateSchema(attested), []);
});

test('the report shows what the student says they checked', () => {
  const report = formatReport(attested, 'UNVERIFIABLE', []);
  assert.match(report, /verified by the student: Traced the base cases/);
});

test('an unattested session reads as not yet checked, not as absent', () => {
  const pending = structuredClone(attested);
  pending.ai_use[0].verification = { attested: false };
  assert.match(formatReport(pending, 'UNVERIFIABLE', []), /has not marked this as verified/);
});

test('receipts without verification still report cleanly', () => {
  const bare = structuredClone(attested);
  delete bare.ai_use[0].verification;
  const report = formatReport(bare, 'UNVERIFIABLE', []);
  assert.doesNotMatch(report, /verified by the student/);
  assert.deepEqual(validateSchema(bare), []);
});

// ---------------------------------------------------------------------------
// The report shows what the student disclosed, as they wrote it
// ---------------------------------------------------------------------------

test('the report prints each session\'s verbatim use, revision, sources and appendix', () => {
  const report = formatReport(v2([
    session({
      direct_content_used: true,
      revision_statement: 'Kept the intro, rewrote the rest.',
      source_verification: true,
      appendix: { share_link_or_excerpt: 'https://example.test/share/abc' },
    }),
    session({ category: 'search', source_verification: false }),
  ]), 'INTACT', []);
  assert.match(report, /AI text kept verbatim: yes/);
  assert.match(report, /revision: Kept the intro, rewrote the rest\./);
  assert.match(report, /sources checked by the student: yes/);
  assert.match(report, /appendix: attached \(share_link_or_excerpt\)/);
  assert.match(report, /AI text kept verbatim: no/);
  assert.match(report, /sources checked by the student: no/);
  assert.match(report, /appendix: none attached/);
});

test('the report never echoes appendix contents', () => {
  const report = formatReport(v2([session({ appendix: { full_transcript: 'SECRET-TRANSCRIPT-TEXT' } })]), 'INTACT', []);
  assert.match(report, /attached \(full_transcript\)/);
  assert.doesNotMatch(report, /SECRET-TRANSCRIPT-TEXT/);
});

test('unset values print as "not stated", not as a problem', () => {
  const report = formatReport(v2([session({ source_verification: null, revision_statement: undefined })]), 'INTACT', []);
  assert.match(report, /sources checked by the student: not stated/);
  assert.match(report, /revision: not stated/);
});

test('the report prints the disclosure paragraph in both schema generations', () => {
  assert.match(formatReport(v2(), 'INTACT', []), /Disclosure paragraph[^\n]*\n\s+I used AI as described above\./);
  assert.match(formatReport(example, 'INTACT', []), /Disclosure paragraph[^\n]*\n\s+d\n/);
});

test('the added report lines still carry no score or total', () => {
  const report = formatReport(v2([session(), session(), session()]), 'INTACT', []);
  assert.doesNotMatch(report, /total|score|rank/i);
});

// ---------------------------------------------------------------------------
// Helpers for the CLI-level tests: capture what runVerify prints
// ---------------------------------------------------------------------------

/** Run runVerify with console captured. @returns {Promise<{code: number, stdout: string, stderr: string}>} */
async function capture(argv) {
  const origLog = console.log;
  const origErr = console.error;
  const out = [];
  const err = [];
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => err.push(a.join(' '));
  try {
    const code = await runVerify(argv);
    return { code, stdout: out.join('\n'), stderr: err.join('\n') };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/** A directory holding a submission and a receipt bound to it. */
async function withBoundReceipt(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'pc-sub-'));
  try {
    const essay = join(dir, 'essay.txt');
    const bytes = Buffer.from('The carbon tax is a policy worth arguing about.\n');
    wf(essay, bytes);
    const body = { ...v2(), submission_hash: sha(bytes) };
    const receiptPath = join(dir, 'receipt.json');
    wf(receiptPath, JSON.stringify({ ...body, content_hash: computeHash(body) }));
    return await fn({ dir, essay, bytes, receiptPath });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- --submission ---

test('--submission reports MATCH for the file the receipt is bound to', async () => {
  await withBoundReceipt(async ({ essay, receiptPath }) => {
    const r = await capture([receiptPath, '--submission', essay]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /Submission file: MATCH/);
  });
});

test('--submission reports DIFFERENT with exit 5 when one byte changed', async () => {
  await withBoundReceipt(async ({ essay, bytes, receiptPath }) => {
    const changed = Buffer.from(bytes);
    changed[0] = changed[0] ^ 1;
    wf(essay, changed);
    const r = await capture([receiptPath, '--submission', essay]);
    assert.equal(r.code, 5);
    assert.match(r.stderr, /Submission file: DIFFERENT/);
  });
});

test('--submission=<file> form works', async () => {
  await withBoundReceipt(async ({ essay, receiptPath }) => {
    assert.equal((await capture([receiptPath, `--submission=${essay}`])).code, 0);
  });
});

test('--submission says so when the receipt has no submission_hash, and exits 0', async () => {
  await withBoundReceipt(async ({ dir, essay }) => {
    const bare = v2();
    const p = join(dir, 'bare.json');
    wf(p, JSON.stringify({ ...bare, content_hash: computeHash(bare) }));
    const r = await capture([p, '--submission', essay]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /receipt has no submission_hash/);
  });
});

test('--submission with a tampered receipt still exits 1, the more severe code', async () => {
  await withBoundReceipt(async ({ dir, essay, bytes }) => {
    const body = { ...v2(), submission_hash: sha(bytes) };
    const p = join(dir, 'edited.json');
    wf(p, JSON.stringify({ ...body, content_hash: 'a'.repeat(64) }));
    wf(essay, 'something else entirely');
    assert.equal((await capture([p, '--submission', essay])).code, 1);
  });
});

test('--submission with an unreadable file, or no value, is a user error (3)', async () => {
  await withBoundReceipt(async ({ dir, receiptPath }) => {
    assert.equal((await capture([receiptPath, '--submission', join(dir, 'nope.pdf')])).code, 3);
    assert.equal((await capture([receiptPath, '--submission'])).code, 3);
  });
});

test('--submission refuses to run against several receipts', async () => {
  await withBoundReceipt(async ({ dir, essay, receiptPath }) => {
    const r = await capture([receiptPath, receiptPath, '--submission', essay]);
    assert.equal(r.code, 3);
    assert.match(r.stderr, /single receipt/);
    assert.equal((await capture([dir, '--submission', essay])).code, 3);
  });
});

test('--help documents --submission and exit 5', async () => {
  const r = await capture(['--help']);
  assert.match(r.stdout, /--submission/);
  assert.match(r.stdout, /\n\s+5\s+/);
});

// --- batch ---

/** A directory of receipts: one INTACT, one MISMATCH, one INVALID, plus noise. */
async function withMixedDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'pc-batch-'));
  try {
    const good = v2();
    wf(join(dir, 'a-intact.json'), JSON.stringify({ ...good, content_hash: computeHash(good) }));
    wf(join(dir, 'b-mismatch.json'), JSON.stringify({ ...good, student: 'Edited', content_hash: computeHash(good) }));
    const { student, ...broken } = good;
    wf(join(dir, 'c-invalid.json'), JSON.stringify({ ...broken, content_hash: computeHash(broken) }));
    wf(join(dir, 'notes.txt'), 'not a receipt');
    mkdirSync(join(dir, 'sub'));
    wf(join(dir, 'sub', 'd-nested.json'), '{}');
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a directory prints one status line per .json file, non-recursively', async () => {
  await withMixedDir(async (dir) => {
    const r = await capture([dir]);
    const lines = r.stdout.split('\n');
    assert.equal(lines.length, 3);
    assert.match(lines[0], /^INTACT\s+.*a-intact\.json$/);
    assert.match(lines[1], /^MISMATCH\s+.*b-mismatch\.json$/);
    assert.match(lines[2], /^INVALID\s+.*c-invalid\.json$/);
    assert.doesNotMatch(r.stdout, /d-nested|notes\.txt/);
  });
});

test('a batch exits with the most severe code (mismatch beats invalid)', async () => {
  await withMixedDir(async (dir) => {
    assert.equal((await capture([dir])).code, 1);
    // Without the mismatch, invalid (4) is the worst present.
    rmSync(join(dir, 'b-mismatch.json'));
    assert.equal((await capture([dir])).code, 4);
  });
});

test('a batch of clean receipts exits 0, and the examples all verify', async () => {
  const ex = new URL('../examples/', import.meta.url).pathname;
  const r = await capture([ex]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /INTACT\s+.*brainstorm-receipt\.json/);
  assert.match(r.stdout, /INTACT\s+.*multi-session-receipt\.json/);
});

test('batch prints no report unless --details is given', async () => {
  await withMixedDir(async (dir) => {
    assert.doesNotMatch((await capture([dir])).stdout, /Receipt summary/);
    const d = await capture([dir, '--details']);
    assert.equal((d.stdout.match(/--- Receipt summary ---/g) || []).length, 3);
    assert.equal(d.code, 1);
  });
});

test('several file arguments are a batch, an unreadable one is ERROR and exits 3', async () => {
  await withMixedDir(async (dir) => {
    const r = await capture([join(dir, 'a-intact.json'), join(dir, 'missing.json')]);
    assert.match(r.stdout, /^INTACT/m);
    assert.match(r.stdout, /^ERROR\s+.*missing\.json/m);
    assert.equal(r.code, 3);
  });
});

test('an empty directory is an error, not a silent success', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-empty-'));
  try {
    const r = await capture([dir]);
    assert.equal(r.code, 3);
    assert.match(r.stdout, /no \.json files/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('batch output carries no counts or totals across receipts', async () => {
  await withMixedDir(async (dir) => {
    const r = await capture([dir, '--details']);
    assert.doesNotMatch(r.stdout, /\b\d+ (receipts|files|sessions|students)\b|total|summary of/i);
  });
});

test('single-file output is unchanged by the batch work: stored/recomputed lines, report, no status word line', async () => {
  const ex = new URL('../examples/brainstorm-receipt.json', import.meta.url).pathname;
  const r = await capture([ex]);
  assert.match(r.stdout, /^ok: .* content_hash matches recomputation\./);
  assert.match(r.stdout, /--- Receipt summary ---/);
  assert.doesNotMatch(r.stdout, /^INTACT\s/m);
});
