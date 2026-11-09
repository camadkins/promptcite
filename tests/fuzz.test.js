// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins
//
// Property-based fuzzing with fast-check. The targets are the code that reads
// input PromptCite doesn't control: receipts handed to promptcite-verify,
// timeline files, source files scanned for markers, locale files, and the
// strings a timeline writes into its markdown table. Each property says what
// must hold for every input, and fast-check looks for one that breaks it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { canonicalize, computeHash, validateSchema, advisoryNotes, formatReport } from '../bin/verify.js';
import { buildTimeline, checkTimeline, renderMarkdown } from '../bin/timeline.js';
import { markersIn, pendingLines } from '../bin/check.js';
import { parseLocale } from '../bin/rule.js';

const example = JSON.parse(readFileSync(new URL('../examples/draft-receipt.json', import.meta.url), 'utf8'));

/** Rebuild an object with its keys in a shuffled order, all the way down. */
function shuffleKeys(/** @type {unknown} */ value, /** @type {() => number} */ rand) {
  if (Array.isArray(value)) return value.map((v) => shuffleKeys(v, rand));
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    // fromEntries defines own keys, so a key named "__proto__" stays a key
    // (plain assignment would set the prototype instead).
    return Object.fromEntries(keys.map((k) => [k, shuffleKeys(/** @type {any} */ (value)[k], rand)]));
  }
  return value;
}

test('the content hash ignores key order, for any JSON object', () => {
  fc.assert(fc.property(fc.dictionary(fc.string(), fc.jsonValue()), fc.integer(), (obj, seed) => {
    let s = seed;
    const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    assert.equal(canonicalize(shuffleKeys(obj, rand)), canonicalize(obj));
  }));
});

test('changing any string in a receipt changes its hash', () => {
  /** @type {string[][]} */
  const paths = [];
  (function walk(/** @type {any} */ v, /** @type {string[]} */ p) {
    if (typeof v === 'string' && p[0] !== 'content_hash') paths.push(p);
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], [...p, k]);
  })(example, []);
  const original = computeHash(example);
  fc.assert(fc.property(fc.constantFrom(...paths), fc.string({ minLength: 1 }), (path, extra) => {
    const copy = JSON.parse(JSON.stringify(example));
    let at = copy;
    for (const k of path.slice(0, -1)) at = at[k];
    at[/** @type {string} */ (path.at(-1))] += extra;
    assert.notEqual(computeHash(copy), original, path.join('.'));
  }));
});

test('the verifier never throws, whatever JSON it is handed', () => {
  fc.assert(fc.property(fc.jsonValue(), (value) => {
    const errs = validateSchema(value);
    assert.ok(Array.isArray(errs));
    advisoryNotes(value);
    if (value && typeof value === 'object' && !Array.isArray(value)) formatReport(value, 'INTACT', errs);
  }));
});

test('a receipt with random junk in its fields never crashes the verifier', () => {
  const field = fc.oneof(fc.jsonValue(), fc.constant(undefined));
  fc.assert(fc.property(field, field, field, field, (a, b, c, d) => {
    const r = JSON.parse(JSON.stringify(example));
    r.ai_use[0].sources = a;
    r.code_files = b;
    r.reflection = c;
    r.outputs.short_statement = d;
    const errs = validateSchema(r);
    assert.ok(Array.isArray(errs));
    formatReport(r, 'INTACT', errs);
    advisoryNotes(r);
  }));
});

const entryArb = fc.record({
  at: fc.oneof(
    fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString()),
    fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10)),
  ),
  kind: fc.constantFrom('receipt_session', 'commit', 'ledger'),
  subject: fc.string(),
  tool: fc.option(fc.string(), { nil: undefined }),
});

test('a timeline always verifies after a round trip through its file', () => {
  fc.assert(fc.property(fc.array(entryArb, { maxLength: 8 }), fc.option(fc.string(), { nil: null }), (entries, student) => {
    const t = buildTimeline({ generatedAt: '2026-11-08T00:00:00Z', assignment: null, student, sources: { receipts: [], git: false, git_skipped: 'x', ledger: false }, entries });
    assert.equal(checkTimeline(JSON.parse(JSON.stringify(t))), null);
  }));
});

test('editing any one timeline entry breaks the chain', () => {
  fc.assert(fc.property(fc.array(entryArb, { minLength: 1, maxLength: 8 }), fc.nat(), fc.string({ minLength: 1 }), (entries, pick, extra) => {
    const t = JSON.parse(JSON.stringify(buildTimeline({ generatedAt: '2026-11-08T00:00:00Z', assignment: null, student: null, sources: { receipts: [], git: false, git_skipped: 'x', ledger: false }, entries })));
    t.entries[pick % t.entries.length].subject += extra;
    assert.notEqual(checkTimeline(t), null);
  }));
});

test('every timeline table row has exactly three cells, whatever the text', () => {
  fc.assert(fc.property(fc.string(), fc.string(), (subject, tool) => {
    const t = buildTimeline({ generatedAt: '2026-11-08T00:00:00Z', assignment: null, student: null, sources: { receipts: [], git: true, git_skipped: null, ledger: false }, entries: [
      { at: '2026-11-01T10:00:00Z', kind: 'commit', sha: 'abcdef1', subject, files_changed: 1, insertions: 1, deletions: 0 },
      { at: '2026-11-02', kind: 'receipt_session', tool, model: 'm', category: 'draft', prompt_summary: subject },
    ] });
    const rows = renderMarkdown(t, 'x.json').split('\n').filter((l) => l.startsWith('| 2026-'));
    assert.equal(rows.length, 2);
    for (const row of rows) assert.equal(row.split(/(?<!\\)\|/).length, 5, row);
  }));
});

test('the marker scanners never throw and never report a line without the vendor string', () => {
  fc.assert(fc.property(fc.string({ maxLength: 400 }), (text) => {
    const lines = text.split('\n');
    for (const n of pendingLines(text)) assert.match(lines[n - 1] ?? '', /via PromptCite/);
    for (const m of markersIn(text)) assert.match(lines[m.line - 1] ?? '', /via PromptCite/);
  }));
});

test('a marker quoted inside a string literal is never reported', () => {
  const marker = (/** @type {string} */ id) => `// @ai-assisted 2026-11-04 X via ${'Prompt'}Cite (pc:${id})`;
  fc.assert(fc.property(fc.stringMatching(/^[0-9a-f]{5}$/), fc.constantFrom('`', '"""'), (id, quote) => {
    const src = `const s = ${quote}\n${marker(id)}\n${quote};\n`;
    assert.deepEqual(markersIn(src), []);
  }));
});

test('the locale parser either parses or throws a plain Error, never anything else', () => {
  fc.assert(fc.property(fc.string({ maxLength: 300 }), (body) => {
    try {
      parseLocale(`---\ncode: xx\nname: X\nstatus: needs-review\n---\n${body}`, 'src/locales/xx.md');
    } catch (e) {
      assert.ok(e instanceof Error, String(e));
    }
  }));
});

test('the hashing recipe in the rule matches the verifier on receipts with non-ASCII text', () => {
  const rule = readFileSync(new URL('../src/rules/receipt.md', import.meta.url), 'utf8');
  assert.match(rule, /ensure_ascii=False/);
  assert.doesNotMatch(rule, /`content_hash` field absent \(or null\)/);
  // What the recipe produces, in JS: sorted keys, raw UTF-8, both hash keys left out.
  const sortDeep = (/** @type {any} */ v) => Array.isArray(v) ? v.map(sortDeep)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])])) : v;
  fc.assert(fc.property(fc.string(), (text) => {
    const r = JSON.parse(JSON.stringify(example));
    r.outputs.disclosure_statement = `${text} — café “quoted”`;
    const { content_hash: _c, submission_hash: _s, ...rest } = r;
    assert.equal(JSON.stringify(sortDeep(rest)), canonicalize(rest));
  }));
});
