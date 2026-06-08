// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = new URL('../bin/install.js', import.meta.url).pathname;

// install.js runs main() + process.exit() on import, so it can't be imported
// like verify.js — exercise it as a subprocess instead. Each run uses a fresh
// temp cwd so we can assert read-only commands write nothing there.
function run(args, cwd) {
  try {
    const out = execFileSync('node', [cli, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function inTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'pc-cli-'));
  try {
    return fn(dir);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

test('--doctor runs, exits 0, and writes nothing to cwd', () => {
  inTempDir((dir) => {
    const { code, out } = run(['--doctor'], dir);
    assert.equal(code, 0);
    assert.match(out, /doctor/);
    assert.equal(readdirSync(dir).length, 0, 'doctor must not write files');
  });
});

test('--print-rule emits the rule and writes nothing to cwd', () => {
  inTempDir((dir) => {
    const { code, out } = run(['--print-rule'], dir);
    assert.equal(code, 0);
    assert.match(out, /\/receipt/);
    assert.equal(readdirSync(dir).length, 0, 'print-rule must not write files');
  });
});

test('--init-config --dry-run writes nothing to cwd', () => {
  inTempDir((dir) => {
    const { code } = run(['--init-config', '--dry-run'], dir);
    assert.equal(code, 0);
    assert.equal(readdirSync(dir).length, 0, 'dry-run must not write files');
  });
});

test('--help and --version still work', () => {
  inTempDir((dir) => {
    assert.equal(run(['--help'], dir).code, 0);
    assert.equal(run(['--version'], dir).code, 0);
  });
});
