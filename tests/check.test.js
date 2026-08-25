// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scan, pendingLines, walk } from '../bin/check.js';

const CHECK = new URL('../bin/check.js', import.meta.url).pathname;

// Built from parts on purpose: a fixture holding the whole marker on one line
// is a marker, and promptcite-check would flag this file when run on the repo.
const TAG = '@ai-unverified';
const MARKER = (id = 'a4f21') => `${TAG} 2026-08-01 Claude Opus 5 via PromptCite (pc:${id})`;

/** A throwaway project tree. */
function sandbox() {
  const cwd = mkdtempSync(join(tmpdir(), 'promptcite-check-'));
  return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

/** Run the CLI the way a student would, and hand back what they'd see. */
function runCheck(cwd, args = []) {
  const result = spawnSync('node', [CHECK, ...args], { cwd, encoding: 'utf8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

test('a clean tree exits 0 and says so', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'sort.py'), 'def f():\n    return 1\n');
    const { code, out } = runCheck(cwd);
    assert.equal(code, 0);
    assert.match(out, /No pending markers/);
  } finally {
    cleanup();
  }
});

test('a pending marker exits 1 and prints file:line', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'sort.py'), `def f():\n    # ${MARKER()}\n    return 1\n`);
    const { code, out } = runCheck(cwd);
    assert.equal(code, 1);
    assert.match(out, /^sort\.py:2$/m);
  } finally {
    cleanup();
  }
});

test('every pending marker in a file is reported, not just the first', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'a.js'), `// ${MARKER('aaaaa')}\nlet x = 1;\n// ${MARKER('bbbbb')}\nlet y = 2;\n`);
    const { code, out } = runCheck(cwd);
    assert.equal(code, 1);
    assert.match(out, /^a\.js:1$/m);
    assert.match(out, /^a\.js:3$/m);
  } finally {
    cleanup();
  }
});

test('a verified marker is not pending', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'sort.py'), '# @ai-verified 2026-08-01 via PromptCite (pc:a4f21): traced base cases\ndef f():\n    return 1\n');
    assert.equal(runCheck(cwd).code, 0);
  } finally {
    cleanup();
  }
});

test('writing about the marker is not the same as carrying one', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'README.md'), 'Clear every `@ai-unverified` marker before you submit.\n');
    assert.equal(runCheck(cwd).code, 0);
  } finally {
    cleanup();
  }
});

test('somebody else\'s code is not the student\'s problem', () => {
  const { cwd, cleanup } = sandbox();
  try {
    mkdirSync(join(cwd, 'node_modules', 'left-pad'), { recursive: true });
    writeFileSync(join(cwd, 'node_modules', 'left-pad', 'index.js'), `// ${MARKER()}\n`);
    mkdirSync(join(cwd, 'dist'));
    writeFileSync(join(cwd, 'dist', 'bundle.js'), `// ${MARKER()}\n`);
    assert.equal(runCheck(cwd).code, 0);
  } finally {
    cleanup();
  }
});

test('symlinks are not followed out of the tree', () => {
  const outside = sandbox();
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(outside.cwd, 'secret.js'), `// ${MARKER()}\n`);
    symlinkSync(outside.cwd, join(cwd, 'linked'));
    assert.equal(runCheck(cwd).code, 0);
  } finally {
    cleanup();
    outside.cleanup();
  }
});

test('binaries are skipped rather than decoded', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'blob.bin'), Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(MARKER())]));
    assert.equal(runCheck(cwd).code, 0);
  } finally {
    cleanup();
  }
});

test('a path that is not there is user error, not a finding', () => {
  const { cwd, cleanup } = sandbox();
  try {
    const { code, err } = runCheck(cwd, ['nope']);
    assert.equal(code, 3);
    assert.match(err, /cannot read/);
  } finally {
    cleanup();
  }
});

test('quiet reports through the exit code alone', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'sort.py'), `# ${MARKER()}\n`);
    const { code, out } = runCheck(cwd, ['--quiet']);
    assert.equal(code, 1);
    assert.equal(out, '');
  } finally {
    cleanup();
  }
});

test('help explains itself without walking anything', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'sort.py'), `# ${MARKER()}\n`);
    const { code, out } = runCheck(cwd, ['--help']);
    assert.equal(code, 0);
    assert.match(out, /does not mean no AI was used/);
  } finally {
    cleanup();
  }
});

test('pendingLines is 1-indexed', () => {
  assert.deepEqual(pendingLines(`a\n// ${MARKER()}\nb\n`), [2]);
});

test('walk finds nested files and skips the denylist', () => {
  const { cwd, cleanup } = sandbox();
  try {
    mkdirSync(join(cwd, 'src', 'deep'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'deep', 'a.js'), 'x\n');
    mkdirSync(join(cwd, '.git'));
    writeFileSync(join(cwd, '.git', 'config'), 'x\n');
    const files = walk(cwd).map((f) => f.replace(cwd, ''));
    assert.ok(files.some((f) => f.endsWith('deep/a.js')));
    assert.ok(!files.some((f) => f.includes('.git')));
  } finally {
    cleanup();
  }
});

test('scan reports paths relative to where the student ran it', () => {
  const { cwd, cleanup } = sandbox();
  try {
    mkdirSync(join(cwd, 'src'));
    writeFileSync(join(cwd, 'src', 'a.js'), `// ${MARKER()}\n`);
    assert.deepEqual(scan(cwd), { hits: [{ file: 'src/a.js', line: 1 }], skipped: [] });
  } finally {
    cleanup();
  }
});

// --- Regressions from stress-testing the scan against a real project tree.

test("a marker-shaped string in the student's own code is not a marker", () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'parser.py'), `PATTERN = "${MARKER()}"\ndef strip(l):\n    return l.replace(PATTERN, "")\n`);
    assert.equal(runCheck(cwd).code, 0);
  } finally {
    cleanup();
  }
});

test('writing about markers in prose is not carrying one', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'README.md'), `Clear these first:\n\n    # ${MARKER()}\n`);
    writeFileSync(join(cwd, 'notes.txt'), `# ${MARKER()}\n`);
    assert.equal(runCheck(cwd).code, 0);
  } finally {
    cleanup();
  }
});

test('the tag has to open the comment, not merely appear in the line', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'a.py'), `x = 1  # see ${MARKER()} for details\n`);
    assert.equal(runCheck(cwd).code, 0);
    writeFileSync(join(cwd, 'b.py'), `    # ${MARKER()}\n`);
    assert.equal(runCheck(cwd).code, 1, 'an indented marker is still a marker');
  } finally {
    cleanup();
  }
});

test('--all reaches code the student parked in a build directory', () => {
  const { cwd, cleanup } = sandbox();
  try {
    mkdirSync(join(cwd, 'build'));
    writeFileSync(join(cwd, 'build', 'tool.py'), `# ${MARKER()}\n`);
    assert.equal(runCheck(cwd).code, 0, 'skipped by default');
    assert.equal(runCheck(cwd, ['--all']).code, 1, 'reachable on request');
  } finally {
    cleanup();
  }
});

test('help names the directories it walks past', () => {
  const { cwd, cleanup } = sandbox();
  try {
    assert.match(runCheck(cwd, ['--help']).out, /node_modules/);
  } finally {
    cleanup();
  }
});

test('non-ascii paths are walked like any other', () => {
  const { cwd, cleanup } = sandbox();
  try {
    mkdirSync(join(cwd, 'données'));
    writeFileSync(join(cwd, 'données', 'analyse.py'), `# ${MARKER()}\n`);
    const { code, out } = runCheck(cwd);
    assert.equal(code, 1);
    assert.match(out, /données\/analyse\.py:1/);
  } finally {
    cleanup();
  }
});

test('every comment syntax the hook can write is recognized', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'a.py'), `# ${MARKER('aaaaa')}\n`);
    writeFileSync(join(cwd, 'b.js'), `// ${MARKER('bbbbb')}\n`);
    writeFileSync(join(cwd, 'c.sql'), `-- ${MARKER('ccccc')}\n`);
    writeFileSync(join(cwd, 'd.clj'), `; ${MARKER('ddddd')}\n`);
    writeFileSync(join(cwd, 'e.ts'), `/** ${MARKER('eeeee')} */\n`);
    const { out } = runCheck(cwd);
    for (const f of ['a.py', 'b.js', 'c.sql', 'd.clj', 'e.ts']) {
      assert.match(out, new RegExp(`${f.replace('.', '\\.')}:1`), `${f} not reported`);
    }
  } finally {
    cleanup();
  }
});

test('a marker is seen in files the hook refuses to write to', () => {
  // The browser path puts markers wherever the student pastes code. Refusing to
  // write a marker into JSX is not a reason to be blind to one already there.
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'List.jsx'), `<div>\n  // ${MARKER('aaaaa')}\n  <ul/>\n</div>\n`);
    writeFileSync(join(cwd, 'card.php'), `<?php $t = 1; ?>\n// ${MARKER('bbbbb')}\n`);
    const { code, out } = runCheck(cwd);
    assert.equal(code, 1);
    assert.match(out, /List\.jsx:2/);
    assert.match(out, /card\.php:2/);
  } finally {
    cleanup();
  }
});

test('a tag inside a docstring is data, not a gate the student can clear', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'doc.py'), `def g():\n    """\n    # ${MARKER()}\n    Docs.\n    """\n    return 2\n`);
    assert.equal(runCheck(cwd).code, 0, 'attest is told to leave these alone, so check must not list them');
  } finally {
    cleanup();
  }
});

test('a real marker after a closed docstring is still listed', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'a.py'), `def g():\n    """Docs."""\n    return 2\n\n# ${MARKER()}\ndef h():\n    return 3\n`);
    const { code, out } = runCheck(cwd);
    assert.equal(code, 1);
    assert.match(out, /a\.py:5/);
  } finally {
    cleanup();
  }
});

test('a disputed marker is settled, not open', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'mine.py'), '# @ai-disputed 2026-08-20 via PromptCite (pc:aaaaa): i wrote this myself\ndef mine(x):\n    return x + 1\n');
    assert.equal(runCheck(cwd).code, 0);
  } finally {
    cleanup();
  }
});

test('files holding a tag with nothing to clear are named, not hidden', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'parser.py'), `PATTERN = "${MARKER()}"\n`);
    const { code, out } = runCheck(cwd);
    assert.equal(code, 0);
    assert.match(out, /^note: the tag also appears/m);
    assert.match(out, /^  parser\.py$/m);
    assert.match(out, /nothing in them to clear/);
  } finally {
    cleanup();
  }
});

test('the note stays out of quiet output', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'parser.py'), `PATTERN = "${MARKER()}"\n`);
    assert.equal(runCheck(cwd, ['--quiet']).out, '');
  } finally {
    cleanup();
  }
});

test('an unreadable directory inside the tree is skipped, not fatal', () => {
  const { cwd, cleanup } = sandbox();
  const locked = join(cwd, 'locked');
  try {
    writeFileSync(join(cwd, 'a.py'), `# ${MARKER()}\n`);
    mkdirSync(locked);
    writeFileSync(join(locked, 'b.py'), `# ${MARKER('bbbbb')}\n`);
    chmodSync(locked, 0o000);
    const { code, out } = runCheck(cwd);
    assert.equal(code, 1, 'the readable part still reports');
    assert.match(out, /a\.py:1/);
    assert.doesNotMatch(out, /cannot read/);
  } finally {
    try { chmodSync(locked, 0o755); } catch {}
    cleanup();
  }
});

test('a file given where a directory belongs is user error', () => {
  const { cwd, cleanup } = sandbox();
  try {
    writeFileSync(join(cwd, 'a.py'), 'x = 1\n');
    const { code, err } = runCheck(cwd, ['a.py']);
    assert.equal(code, 3);
    assert.match(err, /cannot read/);
  } finally {
    cleanup();
  }
});
