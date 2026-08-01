// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
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
