// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOTE, buildTimeline, checkTimeline, gitEntries, runTimeline } from '../bin/timeline.js';
import { resolveLedgerPath } from '../bin/hook.js';

const example = fileURLToPath(new URL('../examples/draft-receipt.json', import.meta.url));

/** @param {string} dir @param {string[]} args */
const git = (dir, ...args) => execFileSync('git', ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], { stdio: 'pipe' });

/**
 * A temp assignment folder: a git repo with two dated commits and a receipt.
 * @param {(dir: string, home: string) => Promise<void>} fn
 * @param {{ repo?: boolean, receipt?: boolean }} [opts]
 */
async function withAssignment(fn, { repo = true, receipt = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pc-tl-'));
  const home = mkdtempSync(join(tmpdir(), 'pc-tl-home-'));
  try {
    if (repo) {
      git(dir, 'init', '-q');
      writeFileSync(join(dir, 'essay.md'), 'one\n');
      git(dir, 'add', '.');
      execFileSync('git', ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'start essay'], { env: { ...process.env, GIT_AUTHOR_DATE: '2026-11-01T10:00:00Z', GIT_COMMITTER_DATE: '2026-11-01T10:00:00Z' } });
      writeFileSync(join(dir, 'essay.md'), 'one\ntwo\nthree\n');
      execFileSync('git', ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qam', 'second draft'], { env: { ...process.env, GIT_AUTHOR_DATE: '2026-11-06T10:00:00Z', GIT_COMMITTER_DATE: '2026-11-06T10:00:00Z' } });
    }
    if (receipt) copyFileSync(example, join(dir, 'ai-receipt.json'));
    await fn(dir, home);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

/** @param {string} dir @param {string[]} [argv] @param {any} [io] */
async function run(dir, argv = [], io = {}) {
  const out = [];
  const code = await runTimeline(argv, { cwd: dir, log: (m) => out.push(m), err: (m) => out.push(m), now: new Date('2026-11-08T12:00:00Z'), ...io });
  return { code, out: out.join('\n') };
}

/** @param {string} dir @param {string} [name] */
const readTimeline = (dir, name = 'promptcite-timeline.json') => JSON.parse(readFileSync(join(dir, name), 'utf8'));

test('receipts and commits come out in date order, chained, and the chain holds', async () => {
  await withAssignment(async (dir) => {
    const r = await run(dir);
    assert.equal(r.code, 0, r.out);
    const t = readTimeline(dir);
    assert.deepEqual(t.entries.map((/** @type {any} */ e) => [e.at.slice(0, 10), e.kind]), [
      ['2026-11-01', 'commit'],
      ['2026-11-02', 'receipt_session'],
      ['2026-11-05', 'receipt_session'],
      ['2026-11-06', 'commit'],
    ]);
    const second = t.entries[3];
    assert.equal(second.subject, 'second draft');
    assert.deepEqual([second.files_changed, second.insertions, second.deletions], [1, 2, 0]);
    assert.equal(t.entries[0].prev, t.header_hash);
    for (let i = 1; i < t.entries.length; i++) assert.equal(t.entries[i].prev, t.entries[i - 1].hash);
    assert.equal(t.head, t.entries.at(-1).hash);
    assert.equal(checkTimeline(t), null);
    assert.equal(t.sources.ledger, false);
    assert.ok(existsSync(join(dir, 'promptcite-timeline.md')));
    assert.match(r.out, /head hash: [0-9a-f]{64}/);
    assert.equal((await run(dir, ['verify', 'promptcite-timeline.json'])).code, 0);
  });
});

test('the chain breaks on any edit: an entry, the header, a removal, a reorder, the head', async () => {
  await withAssignment(async (dir) => {
    await run(dir);
    const t = readTimeline(dir);
    const clone = () => JSON.parse(JSON.stringify(t));

    const edited = clone();
    edited.entries[1].prompt_summary = 'Something I never asked';
    assert.match(String(checkTimeline(edited)), /entry 1 was changed/);

    const header = clone();
    header.student = 'Someone Else';
    assert.match(String(checkTimeline(header)), /header was changed/);

    const removed = clone();
    removed.entries.splice(1, 1);
    assert.match(String(checkTimeline(removed)), /out of place/);

    const swapped = clone();
    [swapped.entries[0], swapped.entries[1]] = [swapped.entries[1], swapped.entries[0]];
    assert.ok(checkTimeline(swapped));

    const head = clone();
    head.head = '0'.repeat(64);
    assert.match(String(checkTimeline(head)), /head hash/);

    // Rehashing one entry by hand still breaks the next link.
    const rehashed = clone();
    rehashed.entries[1].prompt_summary = 'x';
    const { hash, ...body } = rehashed.entries[1];
    const { createHash } = await import('node:crypto');
    const { canonicalize } = await import('../bin/verify.js');
    rehashed.entries[1].hash = createHash('sha256').update(canonicalize(body)).digest('hex');
    assert.match(String(checkTimeline(rehashed)), /entry 2 doesn't follow entry 1/);

    writeFileSync(join(dir, 'edited.json'), JSON.stringify(edited));
    const r = await run(dir, ['verify', 'edited.json']);
    assert.equal(r.code, 1);
    assert.match(r.out, /^BROKEN/);
  });
});

test('the ledger stays out unless asked, and is shown before it goes in', async () => {
  await withAssignment(async (dir, home) => {
    const path = resolveLedgerPath(dir, home);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ schema_version: '1.0', event_id: 'abc12', ts: '2026-11-03T15:00:00Z', tool: 'claude-code', file: 'essay.md', lines_added: 12 })}\nnot json\n`);

    await run(dir, [], { home });
    assert.ok(readTimeline(dir).entries.every((/** @type {any} */ e) => e.kind !== 'ledger'), 'ledger leaked in without --with-ledger');

    /** @type {string[]} */
    const asked = [];
    const no = await run(dir, ['--with-ledger'], { home, confirm: async (/** @type {string} */ q) => { asked.push(q); return false; } });
    assert.equal(asked.length, 1);
    assert.match(no.out, /2026-11-03 {2}claude-code inserted 12 lines into essay\.md/);
    assert.ok(readTimeline(dir, 'promptcite-timeline-2.json').entries.every((/** @type {any} */ e) => e.kind !== 'ledger'));

    await run(dir, ['--with-ledger'], { home, confirm: async () => true });
    const t = readTimeline(dir, 'promptcite-timeline-3.json');
    const led = t.entries.filter((/** @type {any} */ e) => e.kind === 'ledger');
    assert.equal(led.length, 1);
    assert.match(led[0].note, /incomplete by design/);
    assert.equal(t.sources.ledger, true);
    assert.match(readFileSync(join(dir, 'promptcite-timeline-3.md'), 'utf8'), /ledger note .* incomplete by design/);
  });
});

test('it never overwrites: a second run writes the next free name', async () => {
  await withAssignment(async (dir) => {
    await run(dir);
    const before = readFileSync(join(dir, 'promptcite-timeline.json'), 'utf8');
    const r = await run(dir);
    assert.match(r.out, /wrote promptcite-timeline-2\.json and promptcite-timeline-2\.md/);
    assert.equal(readFileSync(join(dir, 'promptcite-timeline.json'), 'utf8'), before);
  });
});

test('outside a git repo it says so and still writes the receipts', async () => {
  await withAssignment(async (dir) => {
    const r = await run(dir);
    assert.equal(r.code, 0);
    assert.match(r.out, /git: skipped, this folder is not in a git repository/);
    const t = readTimeline(dir);
    assert.equal(t.sources.git, false);
    assert.equal(t.entries.length, 2);
  }, { repo: false });
});

test('receipts for different assignments are refused, by name', async () => {
  await withAssignment(async (dir) => {
    const other = JSON.parse(readFileSync(example, 'utf8'));
    other.assignment.title = 'A different essay';
    writeFileSync(join(dir, 'ai-receipt-2.json'), JSON.stringify(other));
    const r = await run(dir);
    assert.equal(r.code, 1);
    assert.match(r.out, /different assignments/);
    assert.ok(!existsSync(join(dir, 'promptcite-timeline.json')));
    assert.equal((await run(dir, ['--receipt', 'ai-receipt.json'])).code, 0);
  });
});

test('--since narrows the commits, and a bad date is a user error', async () => {
  await withAssignment(async (dir) => {
    const { entries } = gitEntries(dir, { since: '2026-11-05' });
    assert.deepEqual(entries.map((e) => e.subject), ['second draft']);
    assert.equal((await run(dir, ['--since', 'last week'])).code, 1);
  });
});

test('the wording is evidence of process, never proof', async () => {
  const src = readFileSync(new URL('../bin/timeline.js', import.meta.url), 'utf8');
  assert.match(NOTE, /^Evidence of process/);
  for (const m of src.matchAll(/[^\n]*\b(proof|prove[sn]?|proving)\b[^\n]*/gi)) assert.fail(`timeline.js says "${m[0].trim()}"`);
  const t = buildTimeline({ generatedAt: '2026-11-08T00:00:00Z', assignment: null, student: null, sources: { receipts: [], git: false, git_skipped: 'x', ledger: false }, entries: [] });
  assert.equal(checkTimeline(t), null);
  assert.equal(t.head, t.header_hash);
});

test('`promptcite timeline` is reachable from the main CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-tl-cli-'));
  try {
    const out = execFileSync(process.execPath, [fileURLToPath(new URL('../bin/install.js', import.meta.url)), 'timeline', '--help'], { cwd: dir, encoding: 'utf8' });
    assert.match(out, /promptcite timeline verify <file\.json>/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
