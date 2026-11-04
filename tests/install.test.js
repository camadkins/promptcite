// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = new URL('../bin/install.js', import.meta.url).pathname;

// Every subprocess gets a throwaway HOME so global installs can never touch the
// real machine. Tests that need to inspect it pass their own via `env`.
const SANDBOX_HOME = mkdtempSync(join(tmpdir(), 'pc-home-'));
let activeEnv = null;
function sandboxEnv(home = SANDBOX_HOME) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.CLAUDE_CONFIG_DIR;
  delete env.CODEX_HOME;
  return env;
}

// install.js runs main() + process.exit() on import, so it can't be imported
// like verify.js — exercise it as a subprocess instead. Each run uses a fresh
// temp cwd so we can assert read-only commands write nothing there.
function run(args, cwd, script = cli, extra = []) {
  try {
    const out = execFileSync('node', [script, ...args, ...extra], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: activeEnv ?? sandboxEnv(),
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
    assert.match(out, /of 26 agents/);
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
    const { code, out } = run(['--all', '--dry-run', '--no-color'], dir);
    assert.equal(code, 0);
    // the skip line tells the student how to install it, not "coming soon"
    assert.match(out, /skipping replit: installs per project\. Run it inside your project: promptcite --only replit --with-init/);
    assert.doesNotMatch(out, /coming in next release|npx skills add/);
  });
});

test('--only a per-project adapter without --with-init is a user error with the fix', () => {
  inTempDir((dir) => {
    const { code, out } = run(['--only', 'zed'], dir);
    assert.equal(code, 1);
    assert.match(out, /zed installs per project\. Run it inside your project: promptcite --only zed --with-init/);
  });
});

// ---------------------------------------------------------------------------
// hook-register — the only strategy that edits a config the user already owns
// ---------------------------------------------------------------------------

const EXISTING_SETTINGS = JSON.stringify({
  model: 'opus',
  hooks: {
    PostToolUse: [{ matcher: 'Write|Edit', hooks: [{ type: 'command', command: '/my/formatter.sh' }] }],
    SessionStart: [{ hooks: [{ type: 'command', command: '/my/greeter.sh' }] }],
  },
}, null, 2);

test('hook entries are never installed by --all', () => {
  inTempDir((dir) => {
    const sandbox = join(dir, 'cfg');
    const { code, out } = run(['--dry-run', '--all', '--config-dir', sandbox], dir);
    assert.equal(code, 0);
    assert.doesNotMatch(out, /claude-hook|codex-hook/, 'opt-in entries must not appear in --all');
  });
});

test('hook entries are still listed so users can find them', () => {
  inTempDir((dir) => {
    assert.match(run(['--list'], dir).out, /claude-hook/);
  });
});

test('hook-register --dry-run writes nothing', () => {
  inTempDir((dir) => {
    const sandbox = join(dir, 'cfg');
    assert.equal(run(['--dry-run', '--only', 'claude-hook', '--config-dir', sandbox], dir).code, 0);
    assert.ok(!existsSync(sandbox), 'dry-run must not create the config dir');
  });
});

test('hook-register preserves the user\'s other settings and hooks', () => {
  inTempDir((dir) => {
    const sandbox = join(dir, 'cfg');
    mkdirSync(sandbox);
    const file = join(sandbox, 'settings.json');
    writeFileSync(file, EXISTING_SETTINGS);
    assert.equal(run(['--only', 'claude-hook', '--config-dir', sandbox], dir).code, 0);
    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(after.model, 'opus', 'unrelated settings survive');
    assert.equal(after.hooks.SessionStart[0].hooks[0].command, '/my/greeter.sh', 'other events survive');
    const commands = after.hooks.PostToolUse[0].hooks.map((h) => h.command);
    assert.ok(commands.some((c) => c === '/my/formatter.sh'), 'existing hook in the same group survives');
    assert.ok(commands.some((c) => c.includes('--id promptcite')), 'our hook is registered');
  });
});

test('hook-register backs up the file before touching it', () => {
  inTempDir((dir) => {
    const sandbox = join(dir, 'cfg');
    mkdirSync(sandbox);
    writeFileSync(join(sandbox, 'settings.json'), EXISTING_SETTINGS);
    run(['--only', 'claude-hook', '--config-dir', sandbox], dir);
    assert.equal(readFileSync(join(sandbox, 'settings.json.promptcite-backup'), 'utf8'), EXISTING_SETTINGS);
  });
});

test('hook-register is idempotent', () => {
  inTempDir((dir) => {
    const sandbox = join(dir, 'cfg');
    mkdirSync(sandbox);
    const file = join(sandbox, 'settings.json');
    writeFileSync(file, EXISTING_SETTINGS);
    run(['--only', 'claude-hook', '--config-dir', sandbox], dir);
    const first = readFileSync(file, 'utf8');
    run(['--only', 'claude-hook', '--config-dir', sandbox], dir);
    assert.equal(readFileSync(file, 'utf8'), first, 'installing twice must not duplicate the entry');
  });
});

test('hook-register uninstall removes only our entry', () => {
  inTempDir((dir) => {
    const sandbox = join(dir, 'cfg');
    mkdirSync(sandbox);
    const file = join(sandbox, 'settings.json');
    writeFileSync(file, EXISTING_SETTINGS);
    run(['--only', 'claude-hook', '--config-dir', sandbox], dir);
    assert.equal(run(['--only', 'claude-hook', '--config-dir', sandbox, '--uninstall'], dir).code, 0);
    const after = readFileSync(file, 'utf8');
    assert.doesNotMatch(after, /promptcite/, 'our entry is gone');
    const parsed = JSON.parse(after);
    assert.equal(parsed.hooks.PostToolUse[0].hooks[0].command, '/my/formatter.sh');
    assert.equal(parsed.hooks.SessionStart[0].hooks[0].command, '/my/greeter.sh');
  });
});

test('hook-register creates a config file when none exists', () => {
  inTempDir((dir) => {
    const sandbox = join(dir, 'cfg');
    assert.equal(run(['--only', 'claude-hook', '--config-dir', sandbox], dir).code, 0);
    const parsed = JSON.parse(readFileSync(join(sandbox, 'settings.json'), 'utf8'));
    assert.ok(parsed.hooks.PostToolUse[0].hooks[0].command.includes('--id promptcite'));
  });
});

test('hook-register refuses to overwrite a config it cannot parse', () => {
  inTempDir((dir) => {
    const sandbox = join(dir, 'cfg');
    mkdirSync(sandbox);
    const file = join(sandbox, 'settings.json');
    writeFileSync(file, '{ this is not json');
    assert.notEqual(run(['--only', 'claude-hook', '--config-dir', sandbox], dir).code, 0);
    assert.equal(readFileSync(file, 'utf8'), '{ this is not json', 'unparseable config left untouched');
  });
});

// ---------------------------------------------------------------------------
// Package integrity — the bins must work when INSTALLED, not just in the repo
// ---------------------------------------------------------------------------

// npm installs a bin as a symlink (node_modules/.bin/x -> ../pkg/bin/x.js), so
// process.argv[1] is the link while import.meta.url is the real file. Comparing
// them directly means the CLI body never runs and the command exits 0 in
// silence — indistinguishable from success. Only an install-and-run test sees
// it; running the file from the repo works fine either way.
test('CLI entry points still run when reached through a symlink', () => {
  inTempDir((dir) => {
    const linkDir = join(dir, 'bin');
    mkdirSync(linkDir);
    const link = join(linkDir, 'promptcite-verify');
    symlinkSync(new URL('../bin/verify.js', import.meta.url).pathname, link);

    const receipt = new URL('../examples/multi-session-receipt.json', import.meta.url).pathname;
    const { code, out } = run([], dir, link, [receipt]);
    assert.equal(code, 0, 'verifier should exit 0 on a valid receipt');
    assert.match(out, /content_hash matches/, 'the CLI must actually produce output through the symlink');
    assert.match(out, /Schema:\s+2\.0 — VALID/);
  });
});

test('the packaged file list still contains everything the CLI reads', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url).pathname, 'utf8'));
  // readRuleSource() reads <repoRoot>/src/rules/receipt.md at runtime, so `src/`
  // must ship. Dropping it would break every adapter with no local test failure.
  assert.ok(pkg.files.includes('src/'), 'src/ must ship — the installer reads the rule file from it');
  assert.ok(pkg.files.includes('bin/'), 'bin/ must ship');
  for (const bin of Object.values(pkg.bin)) {
    assert.ok(existsSync(new URL(`../${bin}`, import.meta.url).pathname), `${bin} listed in package.bin must exist`);
  }
});

// --- The on/off switch. A student turns this on for an assignment and off when
// --- it's handed in, without hand-editing JSON.

const readConfig = (dir) => JSON.parse(readFileSync(join(dir, 'promptcite.config.json'), 'utf8'));

test('on turns recording and attestation on for this folder', () => inTempDir((dir) => {
  assert.equal(run(['on'], dir).code, 0);
  const config = readConfig(dir);
  assert.equal(config.ledger.enabled, true);
  assert.equal(config.markers.enabled, true);
  assert.equal(config.markers.attest, true);
  assert.equal(config.enabled, undefined, 'on clears the master switch rather than setting it true');
}));

test('on --no-attest gives plain provenance', () => inTempDir((dir) => {
  run(['on', '--no-attest'], dir);
  assert.equal(readConfig(dir).markers.attest, false);
}));

test('off writes an explicit false, which is what beats a policy', () => inTempDir((dir) => {
  run(['on'], dir);
  assert.equal(run(['off'], dir).code, 0);
  assert.equal(readConfig(dir).enabled, false);
}));

test('the switch keeps settings it did not come for', () => inTempDir((dir) => {
  writeFileSync(join(dir, 'promptcite.config.json'), JSON.stringify({ citation_style: 'APA', student: 'C. Hawkins' }));
  run(['on'], dir);
  run(['off'], dir);
  const config = readConfig(dir);
  assert.equal(config.citation_style, 'APA');
  assert.equal(config.student, 'C. Hawkins');
}));

test('a config that is not valid JSON is replaced rather than fatal', () => inTempDir((dir) => {
  writeFileSync(join(dir, 'promptcite.config.json'), '{ not json');
  const { code, out } = run(['on'], dir);
  assert.equal(code, 0);
  assert.match(out, /isn't valid JSON/);
  assert.equal(readConfig(dir).ledger.enabled, true);
}));

test('status says what is on and what the assignment expects', () => inTempDir((dir) => {
  writeFileSync(join(dir, 'promptcite.policy.json'), JSON.stringify({ require_attestation: true }));
  run(['off'], dir);
  const { out } = run(['status'], dir);
  assert.match(out, /recording: .*off/);
  assert.match(out, /this assignment expects require_attestation/);
  assert.match(out, /Your switch wins on your machine/);
}));

test('--on and --off are accepted as aliases', () => inTempDir((dir) => {
  assert.equal(run(['--on'], dir).code, 0);
  assert.equal(readConfig(dir).ledger.enabled, true);
  assert.equal(run(['--off'], dir).code, 0);
  assert.equal(readConfig(dir).enabled, false);
}));

test('an unknown command is user error, not a silent install', () => inTempDir((dir) => {
  const { code, out } = run(['sideways'], dir);
  assert.equal(code, 2);
  assert.match(out, /unknown command "sideways"/);
  assert.equal(existsSync(join(dir, 'promptcite.config.json')), false);
}));

test('two commands at once is refused', () => inTempDir((dir) => {
  assert.equal(run(['on', 'off'], dir).code, 2);
}));

// ---------------------------------------------------------------------------
// global (user-level) installs — all in a sandbox HOME, never the real one
// ---------------------------------------------------------------------------

// id -> [files written under HOME, and whether each is a shared file (block)]
const GLOBALS = {
  cursor: [['.cursor/skills/receipt/SKILL.md', false]],
  codex: [['.codex/AGENTS.md', true]],
  cline: [['Documents/Cline/Rules/promptcite-receipt.md', false]],
  roo: [['.roo/rules/promptcite-receipt.md', false], ['.roo/commands/receipt.md', false]],
  kiro: [['.kiro/steering/promptcite-receipt.md', false]],
  goose: [['.config/goose/.goosehints', true]],
  opencode: [['.config/opencode/AGENTS.md', true], ['.config/opencode/commands/receipt.md', false]],
  amp: [['.config/amp/AGENTS.md', true]],
  crush: [['.config/AGENTS.md', true]],
  'copilot-cli': [['.copilot/copilot-instructions.md', true]],
  droid: [['.factory/AGENTS.md', true]],
};

function inSandbox(fn) {
  const home = mkdtempSync(join(tmpdir(), 'pc-home-'));
  const cwd = mkdtempSync(join(tmpdir(), 'pc-cwd-'));
  activeEnv = sandboxEnv(home);
  try {
    return fn(home, cwd);
  } finally {
    activeEnv = null;
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
}

for (const [id, files] of Object.entries(GLOBALS)) {
  test(`${id}: plain install writes the user-level files and uninstall removes them`, () => inSandbox((home, cwd) => {
    // pre-existing user content in every shared file must survive
    for (const [rel, shared] of files) {
      if (!shared) continue;
      mkdirSync(join(home, rel, '..'), { recursive: true });
      writeFileSync(join(home, rel), '# mine\nKeep me.\n');
    }
    assert.equal(run(['--only', id], cwd).code, 0);
    for (const [rel] of files) {
      assert.ok(existsSync(join(home, rel)), `${rel} should exist`);
      assert.match(readFileSync(join(home, rel), 'utf8'), /`\/receipt` Interview Rule/);
    }
    assert.deepEqual(readdirSync(cwd), [], 'no per-project files without --with-init');
    assert.equal(run(['--only', id, '--uninstall'], cwd).code, 0);
    for (const [rel, shared] of files) {
      if (shared) {
        const left = readFileSync(join(home, rel), 'utf8');
        assert.match(left, /Keep me\./);
        assert.doesNotMatch(left, /PromptCite/);
      } else {
        assert.ok(!existsSync(join(home, rel)), `${rel} should be gone`);
      }
    }
  }));
}

test('a shared skill folder keeps the user\'s own files on uninstall', () => inSandbox((home, cwd) => {
  const dir = join(home, '.cursor/skills/receipt');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'notes.md'), 'mine');
  assert.equal(run(['--only', 'cursor'], cwd).code, 0);
  assert.equal(run(['--only', 'cursor', '--uninstall'], cwd).code, 0);
  assert.ok(existsSync(join(dir, 'notes.md')));
  assert.ok(!existsSync(join(dir, 'SKILL.md')));
}));

test('--with-init adds the per-project file on top of the global install', () => inSandbox((home, cwd) => {
  assert.equal(run(['--only', 'roo', '--with-init'], cwd).code, 0);
  assert.ok(existsSync(join(cwd, '.roo/rules/promptcite-receipt.md')));
  assert.ok(existsSync(join(home, '.roo/commands/receipt.md')));
  assert.equal(run(['--only', 'roo', '--with-init', '--uninstall'], cwd).code, 0);
  assert.ok(!existsSync(join(cwd, '.roo/rules/promptcite-receipt.md')));
  assert.ok(!existsSync(join(home, '.roo/commands/receipt.md')));
}));

test('droid per-project AGENTS.md block needs --with-init', () => inSandbox((home, cwd) => {
  assert.equal(run(['--only', 'droid', '--with-init'], cwd).code, 0);
  assert.match(readFileSync(join(cwd, 'AGENTS.md'), 'utf8'), /BEGIN PromptCite/);
  assert.match(readFileSync(join(home, '.factory/AGENTS.md'), 'utf8'), /BEGIN PromptCite/);
}));

test('--dry-run of a global install writes nothing', () => inSandbox((home, cwd) => {
  assert.equal(run(['--only', 'opencode', '--dry-run'], cwd).code, 0);
  assert.equal(existsSync(join(home, '.config')), false);
}));

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}

test('--all install then --uninstall in a sandbox HOME leaves no PromptCite files', () => inSandbox((home, cwd) => {
  // make every home-detected agent look present
  for (const d of ['.claude', '.codex', '.cursor', '.roo', '.kiro', '.copilot', '.factory',
    '.config/goose', '.config/opencode', '.config/amp', '.config/crush', 'Documents/Cline']) {
    mkdirSync(join(home, d), { recursive: true });
  }
  const before = walk(home).length;
  assert.equal(run(['--all'], cwd).code, 0);
  assert.ok(walk(home).length > before, 'install wrote files');
  assert.equal(run(['--all', '--uninstall'], cwd).code, 0);
  const leftovers = walk(home).filter((f) => /promptcite|receipt/i.test(f) || /PromptCite/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(leftovers, []);
  assert.equal(walk(home).length, before, 'only the seeded state remains');
}));

test('--only uninstall keeps a project AGENTS.md block other agents still read', () => inSandbox((home, cwd) => {
  writeFileSync(join(cwd, 'AGENTS.md'), '# mine\nKeep me.\n');
  assert.equal(run(['--only', 'codex', '--with-init'], cwd).code, 0);
  const kept = run(['--only', 'amp', '--with-init', '--uninstall', '--no-color'], cwd);
  assert.equal(kept.code, 0);
  assert.match(kept.out, /kept: .*AGENTS\.md \(the block is shared with .*codex/);
  assert.match(readFileSync(join(cwd, 'AGENTS.md'), 'utf8'), /BEGIN PromptCite/);
  assert.equal(run(['--only', 'amp', '--with-init', '--uninstall', '--force'], cwd).code, 0);
  const left = readFileSync(join(cwd, 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(left, /PromptCite/);
  assert.match(left, /Keep me\./);
}));

test('uninstall names the folders it left empty and gives an rmdir line', () => inSandbox((home, cwd) => {
  assert.equal(run(['--only', 'copilot-cli'], cwd).code, 0);
  const { code, out } = run(['--only', 'copilot-cli', '--uninstall', '--no-color'], cwd);
  assert.equal(code, 0);
  assert.match(out, /left empty: .*\.copilot/);
  assert.match(out, /rmdir .*\.copilot/);
  assert.ok(existsSync(join(home, '.copilot')), 'we never delete the folder ourselves');
}));
