// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalize, computeHash, runVerify } from '../bin/verify.js';

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
  const path = join(tmpdir(), `pc-test-${process.pid}-${Date.now()}-${Math.random()}.json`);
  writeFileSync(path, JSON.stringify(receipt));
  try {
    return await fn(path);
  } finally {
    try { unlinkSync(path); } catch {}
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
