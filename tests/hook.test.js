// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import {
  resolveLedgerPath,
  loadConfig,
  insertedTextOf,
  buildEvent,
  pruneExpired,
  commentFor,
  markerText,
  shouldMark,
  injectMarker,
} from '../bin/hook.js';

const HOOK = new URL('../bin/hook.js', import.meta.url).pathname;

/** Run the hook as a subprocess with an isolated HOME and cwd. */
function runHook(payload, { cwd, home, tool = 'test-agent' } = {}) {
  return execFileSync('node', [HOOK, '--tool', tool], {
    input: JSON.stringify(payload),
    cwd,
    env: { ...process.env, HOME: home, USERPROFILE: home, PROMPTCITE_DEBUG: '' },
    encoding: 'utf8',
  });
}

function sandbox() {
  const cwd = mkdtempSync(join(tmpdir(), 'promptcite-hook-cwd-'));
  const home = mkdtempSync(join(tmpdir(), 'promptcite-hook-home-'));
  return { cwd, home, cleanup: () => { rmSync(cwd, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); } };
}

function enableLedger(cwd, extra = {}) {
  writeFileSync(join(cwd, 'promptcite.config.json'), JSON.stringify({ ledger: { enabled: true }, ...extra }));
}

function ledgerLines(home, cwd) {
  const path = resolveLedgerPath(cwd, home);
  return existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
}

const writePayload = (file, content) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'Write',
  tool_input: { file_path: file, content },
});

// ---------------------------------------------------------------------------
// Ledger location — the whole point of ADR 0006
// ---------------------------------------------------------------------------

test('ledger path is outside the working directory', () => {
  const path = resolveLedgerPath('/some/student/repo', '/home/student');
  assert.ok(path.startsWith('/home/student/.promptcite/ledgers/'));
  assert.ok(!path.includes('/some/student/repo'));
});

test('ledger path does not leak the directory name', () => {
  const path = resolveLedgerPath('/home/student/cs101-final-project', '/home/student');
  assert.ok(!path.includes('cs101-final-project'));
});

test('different directories get different ledgers', () => {
  const a = resolveLedgerPath('/a', '/home/s');
  const b = resolveLedgerPath('/b', '/home/s');
  assert.notEqual(a, b);
});

// ---------------------------------------------------------------------------
// Off by default
// ---------------------------------------------------------------------------

test('writes nothing when no config is present', () => {
  const { cwd, home, cleanup } = sandbox();
  try {
    const out = runHook(writePayload('a.py', 'print(1)\n'), { cwd, home });
    assert.equal(out, '');
    assert.equal(ledgerLines(home, cwd).length, 0);
    assert.deepEqual(readdirSync(home), []);
  } finally { cleanup(); }
});

test('loadConfig defaults to everything off', () => {
  const { cwd, cleanup } = sandbox();
  try {
    const config = loadConfig(cwd);
    assert.equal(config.ledgerEnabled, false);
    assert.equal(config.markersEnabled, false);
  } finally { cleanup(); }
});

test('instructor policy can enable the ledger without student settings', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'promptcite.policy.json'), JSON.stringify({ require_ledger: true }));
    assert.equal(loadConfig(cwd).ledgerEnabled, true);
  } finally { cleanup(); }
});

test('malformed config is ignored, not fatal', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'promptcite.config.json'), '{ not json');
    assert.equal(loadConfig(cwd).ledgerEnabled, false);
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

test('records one event with the documented shape', () => {
  const { cwd, home, cleanup } = sandbox();
  try {
    enableLedger(cwd);
    runHook(writePayload('src/sort.py', 'a\nb\nc\n'), { cwd, home, tool: 'claude-code' });
    const [event] = ledgerLines(home, cwd);
    assert.equal(event.schema_version, '1.0');
    assert.match(event.event_id, /^[0-9a-f]{5}$/);
    assert.equal(event.tool, 'claude-code');
    assert.equal(event.file, 'src/sort.py');
    assert.equal(event.lines_added, 4);
    assert.ok(Date.parse(event.ts));
  } finally { cleanup(); }
});

test('never records file contents or prompts', () => {
  const { cwd, home, cleanup } = sandbox();
  try {
    enableLedger(cwd);
    runHook(writePayload('a.py', 'SECRET_SENTINEL = 1\n'), { cwd, home });
    const raw = readFileSync(resolveLedgerPath(cwd, home), 'utf8');
    assert.ok(!raw.includes('SECRET_SENTINEL'));
  } finally { cleanup(); }
});

test('file path is recorded relative to the working directory', () => {
  const { cwd, home, cleanup } = sandbox();
  try {
    enableLedger(cwd);
    mkdirSync(join(cwd, 'nested'));
    runHook(writePayload(join(cwd, 'nested/a.py'), 'x\n'), { cwd, home });
    assert.equal(ledgerLines(home, cwd)[0].file, 'nested/a.py');
  } finally { cleanup(); }
});

test('model is omitted rather than guessed when absent', () => {
  const event = buildEvent({ tool: 't', file: 'a.py', text: 'x' });
  assert.ok(!('model' in event));
  assert.equal(buildEvent({ tool: 't', model: 'Opus 5', file: 'a.py', text: 'x' }).model, 'Opus 5');
});

test('ignores tools that do not write files', () => {
  assert.equal(insertedTextOf('Bash', { command: 'ls' }), null);
  assert.equal(insertedTextOf('Read', { file_path: 'a.py' }), null);
  assert.equal(insertedTextOf('Write', { file_path: 'a.py', content: 'x' }), 'x');
  assert.equal(insertedTextOf('Edit', { file_path: 'a.py', new_string: 'y' }), 'y');
});

test('ignores hook events other than PostToolUse', () => {
  const { cwd, home, cleanup } = sandbox();
  try {
    enableLedger(cwd);
    runHook({ ...writePayload('a.py', 'x\n'), hook_event_name: 'PreToolUse' }, { cwd, home });
    assert.equal(ledgerLines(home, cwd).length, 0);
  } finally { cleanup(); }
});

test('expired events are pruned', () => {
  const now = new Date('2026-08-01T00:00:00Z');
  const fresh = JSON.stringify({ ts: '2026-07-30T00:00:00Z' });
  const stale = JSON.stringify({ ts: '2026-01-01T00:00:00Z' });
  assert.deepEqual(pruneExpired([fresh, stale, 'garbage'], 30, now), [fresh]);
});

// ---------------------------------------------------------------------------
// Never breaks the caller
// ---------------------------------------------------------------------------

test('malformed stdin exits 0 and prints nothing', () => {
  const { cwd, home, cleanup } = sandbox();
  try {
    assert.equal(runHook('not json at all', { cwd, home }), '');
  } finally { cleanup(); }
});

test('empty stdin exits 0 and prints nothing', () => {
  const { cwd, home, cleanup } = sandbox();
  try {
    const out = execFileSync('node', [HOOK], { input: '', cwd, env: { ...process.env, HOME: home }, encoding: 'utf8' });
    assert.equal(out, '');
  } finally { cleanup(); }
});

test('never writes to stdout even when recording', () => {
  const { cwd, home, cleanup } = sandbox();
  try {
    enableLedger(cwd);
    assert.equal(runHook(writePayload('a.py', 'x\n'), { cwd, home }), '');
  } finally { cleanup(); }
});

// ---------------------------------------------------------------------------
// Markers — every guard fails closed
// ---------------------------------------------------------------------------

const BLOCK = 'def f():\n    a = 1\n    b = 2\n    c = 3\n    return a\n';
const markArgs = (over = {}) => ({
  toolName: 'Edit', text: BLOCK, file: 'a.py', contents: `x = 0\n${BLOCK}`, minLines: 5, style: 'line', ...over,
});

test('markers are off by default even when the ledger is on', () => {
  const { cwd, home, cleanup } = sandbox();
  try {
    enableLedger(cwd);
    const file = join(cwd, 'a.py');
    writeFileSync(file, `x = 0\n${BLOCK}`);
    runHook({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file, old_string: '', new_string: BLOCK } }, { cwd, home });
    assert.ok(!readFileSync(file, 'utf8').includes('@ai-assisted'));
  } finally { cleanup(); }
});

test('whole-file writes are never marked', () => {
  assert.equal(shouldMark(markArgs({ toolName: 'Write' })), false);
});

test('short insertions are never marked', () => {
  const short = 'a = 1\nb = 2\n';
  assert.equal(shouldMark(markArgs({ text: short, contents: short })), false);
});

test('already-marked text is not marked again', () => {
  const marked = `# @ai-assisted 2026-08-01 (pc:abc12)\n${BLOCK}`;
  assert.equal(shouldMark(markArgs({ text: marked, contents: marked })), false);
});

test('unknown file types are never marked', () => {
  assert.equal(shouldMark(markArgs({ file: 'notes.txt' })), false);
  assert.equal(shouldMark(markArgs({ file: 'README.md' })), false);
  assert.equal(shouldMark(markArgs({ file: 'page.html' })), false);
});

test('ambiguous targets are never marked', () => {
  assert.equal(shouldMark(markArgs({ contents: `${BLOCK}${BLOCK}` })), false);
});

test('mid-line insertions are never marked', () => {
  assert.equal(shouldMark(markArgs({ contents: `x = ${BLOCK}` })), false);
});

test('text absent from the file is never marked', () => {
  assert.equal(shouldMark(markArgs({ contents: 'something else entirely\n' })), false);
});

test('a clean multi-line insertion is marked', () => {
  assert.equal(shouldMark(markArgs()), true);
});

test('marker uses the right comment syntax per language', () => {
  assert.deepEqual(commentFor('a.py', 'line'), { kind: 'line', token: '#' });
  assert.deepEqual(commentFor('a.js', 'line'), { kind: 'line', token: '//' });
  assert.deepEqual(commentFor('a.sql', 'line'), { kind: 'line', token: '--' });
  assert.deepEqual(commentFor('a.js', 'block'), { kind: 'block' });
  assert.equal(commentFor('a.txt', 'line'), null);
});

test('block style falls back to a line comment where a block would be malformed', () => {
  assert.deepEqual(commentFor('a.py', 'block'), { kind: 'line', token: '#' });
});

test('marker text carries date and model so it survives a ledger purge', () => {
  const event = buildEvent({ tool: 't', model: 'Claude Opus 5', file: 'a.py', text: 'x', now: new Date('2026-08-01T12:00:00Z') });
  const text = markerText(event);
  assert.match(text, /^@ai-assisted 2026-08-01 Claude Opus 5 via PromptCite \(pc:[0-9a-f]{5}\)$/);
});

test('injected marker preserves indentation and leaves the code untouched', () => {
  const indented = '    def f():\n        return 1\n';
  const contents = `class A:\n${indented}`;
  const event = buildEvent({ tool: 't', file: 'a.py', text: indented });
  const out = injectMarker(contents, indented, event, 'line');
  assert.ok(out.includes('    # @ai-assisted'));
  assert.ok(out.includes(indented));
  assert.equal(out.split('\n').length, contents.split('\n').length + 1);
});

test('marker mode writes exactly one marker into the file', () => {
  const { cwd, home, cleanup } = sandbox();
  try {
    enableLedger(cwd, { markers: { enabled: true } });
    const file = join(cwd, 'a.py');
    writeFileSync(file, `x = 0\n${BLOCK}`);
    runHook({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file, old_string: '', new_string: BLOCK } }, { cwd, home });
    const out = readFileSync(file, 'utf8');
    assert.equal(out.match(/@ai-assisted/g).length, 1);
    assert.ok(out.includes(BLOCK));
  } finally { cleanup(); }
});

test('the real home directory is never touched by these tests', () => {
  assert.ok(!existsSync(join(homedir(), '.promptcite', 'ledgers', 'test-sentinel.jsonl')));
});
