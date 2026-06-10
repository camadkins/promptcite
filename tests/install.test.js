// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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

test('--list shows the full agent matrix', () => {
  inTempDir((dir) => {
    const { code, out } = run(['--list'], dir);
    assert.equal(code, 0);
    // a spread across the strategies + expansion + AGENTS.md-family agents
    for (const id of ['claude', 'cursor', 'codex', 'amazonq', 'junie', 'zed', 'opencode']) {
      assert.match(out, new RegExp(`\\b${id}\\b`));
    }
    assert.match(out, /of 24 agents/);
  });
});

test('rule-drop adapter installs to its path and uninstalls cleanly', () => {
  inTempDir((dir) => {
    assert.equal(run(['--only', 'kiro', '--with-init'], dir).code, 0);
    const file = join(dir, '.kiro/steering/promptcite-receipt.md');
    assert.ok(existsSync(file), 'rule file should be created');
    assert.match(readFileSync(file, 'utf8'), /PromptCite \/receipt rule/);
    assert.equal(run(['--only', 'kiro', '--with-init', '--uninstall'], dir).code, 0);
    assert.ok(!existsSync(file), 'rule file should be removed');
  });
});

test('block-append adapter preserves existing file content', () => {
  inTempDir((dir) => {
    const file = join(dir, 'replit.md');
    writeFileSync(file, '# My project notes\nKeep me.\n');
    assert.equal(run(['--only', 'replit', '--with-init'], dir).code, 0);
    const after = readFileSync(file, 'utf8');
    assert.match(after, /Keep me\./, 'existing content preserved');
    assert.match(after, /BEGIN PromptCite/, 'block appended');
    assert.equal(run(['--only', 'replit', '--with-init', '--uninstall'], dir).code, 0);
    const restored = readFileSync(file, 'utf8');
    assert.match(restored, /Keep me\./, 'existing content survives uninstall');
    assert.doesNotMatch(restored, /BEGIN PromptCite/, 'block removed on uninstall');
  });
});

test('per-project adapter without --with-init is skipped, not errored, in --all', () => {
  inTempDir((dir) => {
    // .replit present so replit is detected; without --with-init it must skip
    // (stub), exit 0. --dry-run keeps any globally-detected agent (e.g. Claude)
    // from writing to the real config dir during the test.
    writeFileSync(join(dir, '.replit'), '');
    const { code } = run(['--all', '--dry-run'], dir);
    assert.equal(code, 0);
  });
});
