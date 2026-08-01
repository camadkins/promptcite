#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins
// PromptCite installer — github.com/camadkins/promptcite

import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execSync, spawn } from 'node:child_process';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {(text: string) => string} ColorFn
 * @typedef {Object} ColorMap
 * @property {ColorFn} bold
 * @property {ColorFn} dim
 * @property {ColorFn} red
 * @property {ColorFn} green
 * @property {ColorFn} yellow
 * @property {ColorFn} blue
 * @property {ColorFn} cyan
 * @property {ColorFn} gray
 */

/** @type {ColorMap} */
const c = {
  bold: (text) => `\x1b[1m${text}\x1b[22m`,
  dim: (text) => `\x1b[2m${text}\x1b[22m`,
  red: (text) => `\x1b[31m${text}\x1b[39m`,
  green: (text) => `\x1b[32m${text}\x1b[39m`,
  yellow: (text) => `\x1b[33m${text}\x1b[39m`,
  blue: (text) => `\x1b[34m${text}\x1b[39m`,
  cyan: (text) => `\x1b[36m${text}\x1b[39m`,
  gray: (text) => `\x1b[90m${text}\x1b[39m`,
};

class UserError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'UserError';
  }
}

/**
 * @typedef {Object} Adapter
 * @property {(target: string, content: string) => Promise<void>} writeFile
 * @property {(target: string) => Promise<void>} deleteFile
 * @property {(target: string) => Promise<void>} deleteDirectory
 * @property {(target: string) => Promise<boolean>} pathExists
 * @property {(target: string) => Promise<string | null>} readFileIfPresent
 * @property {(target: string) => Promise<void>} ensureDirectory
 * @property {(msg: string) => void} log
 * @property {boolean} dryRun
 */

/**
 * @typedef {Object} Provider
 * @property {string} id
 * @property {string} name
 * @property {() => boolean} detect
 * @property {(ctx: InstallContext) => Promise<void>} install
 * @property {(ctx: InstallContext) => Promise<void>} uninstall
 * @property {boolean} autoActivates
 * @property {string[]} targetPaths
 * @property {any} entry
 */

/**
 * @typedef {Object} InstallContext
 * @property {string} configDir
 * @property {string} repoRoot
 * @property {string} cwd
 * @property {boolean} withInit
 * @property {boolean} force
 * @property {boolean} dryRun
 * @property {(msg: string) => void} log
 * @property {Adapter} adapter
 */

/** @param {string} target */
async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} target @returns {Promise<string | null>} */
async function readFileIfPresent(target) {
  try {
    return await readFile(target, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * @param {(msg: string) => void} log
 * @returns {Adapter}
 */
function createRealAdapter(log) {
  return {
    dryRun: false,
    log,
    async writeFile(target, content) {
      await writeFile(target, content, 'utf8');
      log(`wrote ${target} (${Buffer.byteLength(content, 'utf8')} bytes)`);
    },
    async deleteFile(target) {
      await rm(target, { force: true });
      log(`removed ${target}`);
    },
    async deleteDirectory(target) {
      await rm(target, { recursive: true, force: true });
      log(`removed ${target}`);
    },
    async pathExists(target) {
      return pathExists(target);
    },
    async readFileIfPresent(target) {
      return readFileIfPresent(target);
    },
    async ensureDirectory(target) {
      await mkdir(target, { recursive: true });
    },
  };
}

/**
 * @param {(msg: string) => void} log
 * @returns {Adapter}
 */
function createDryRunAdapter(log) {
  return {
    dryRun: true,
    log,
    async writeFile(target, content) {
      log(`[DRY-RUN] would write ${target} (${Buffer.byteLength(content, 'utf8')} bytes)`);
    },
    async deleteFile(target) {
      log(`[DRY-RUN] would remove ${target}`);
    },
    async deleteDirectory(target) {
      log(`[DRY-RUN] would remove directory ${target}`);
    },
    async pathExists(target) {
      return pathExists(target);
    },
    async readFileIfPresent(target) {
      return readFileIfPresent(target);
    },
    async ensureDirectory(target) {
      log(`[DRY-RUN] would create directory ${target}`);
    },
  };
}

/**
 * @param {InstallContext} ctx
 * @returns {Promise<string>}
 */
async function readRuleSource(ctx) {
  const target = join(ctx.repoRoot, 'src', 'rules', 'receipt.md');
  try {
    return await readFile(target, 'utf8');
  } catch {
    throw new Error(`rule source missing at ${target}`);
  }
}

/**
 * @param {{ adapter: Adapter, targetPath: string, header?: string | null, ruleBody: string }} options
 */
async function dropRuleFile({ adapter, targetPath, header, ruleBody }) {
  const content = header ? `${header}\n\n${ruleBody}` : ruleBody;
  const existing = await adapter.readFileIfPresent(targetPath);
  if (existing === content) {
    adapter.log(`already up-to-date: ${targetPath}`);
    return;
  }
  await adapter.ensureDirectory(dirname(targetPath));
  await adapter.writeFile(targetPath, content);
}

/**
 * @param {'begin' | 'end'} side
 * @returns {string}
 */
function copilotMarker(side) {
  return side === 'begin'
    ? '<!-- BEGIN PromptCite /receipt rule — see github.com/camadkins/promptcite -->'
    : '<!-- END PromptCite /receipt rule -->';
}

/**
 * @param {string} ruleBody
 * @returns {string}
 */
function buildCopilotBlock(ruleBody) {
  return `${copilotMarker('begin')}\n${ruleBody.trim()}\n${copilotMarker('end')}\n`;
}

/**
 * @param {{ adapter: Adapter, targetPath: string, ruleBody: string }} options
 */
async function appendCopilotBlock({ adapter, targetPath, ruleBody }) {
  const existing = await adapter.readFileIfPresent(targetPath);
  const block = buildCopilotBlock(ruleBody);
  if (existing && existing.includes(copilotMarker('begin'))) {
    adapter.log(`already up-to-date: ${targetPath}`);
    return;
  }
  const newContent = existing ? `${existing.trimEnd()}\n\n${block}` : block;
  await adapter.ensureDirectory(dirname(targetPath));
  await adapter.writeFile(targetPath, newContent);
}

/**
 * @param {{ adapter: Adapter, targetPath: string }} options
 */
async function removeCopilotBlock({ adapter, targetPath }) {
  const existing = await adapter.readFileIfPresent(targetPath);
  if (!existing) {
    return;
  }
  const begin = copilotMarker('begin');
  const end = copilotMarker('end');
  const startIdx = existing.indexOf(begin);
  const endIdx = existing.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return;
  }
  let stripped = existing.slice(0, startIdx) + existing.slice(endIdx + end.length);
  stripped = stripped.replace(/\n{3,}/g, '\n\n').trim();
  if (stripped.length === 0) {
    await adapter.deleteFile(targetPath);
    return;
  }
  await adapter.writeFile(targetPath, `${stripped}\n`);
}

class StubSkipError extends Error {
  /**
   * @param {string} providerId
   */
  constructor(providerId) {
    super(`stub-only provider: ${providerId}`);
    this.name = 'StubSkipError';
    this.providerId = providerId;
  }
}

/** @param {string} id */
const STUB_MESSAGE = (id) =>
  `[${id}] adapter coming in next release — for now use 'npx skills add camadkins/promptcite -a ${id}' (validates against vercel-labs/skills registry once promptcite is added)`;

const RULE_HEADER = '<!-- PromptCite /receipt rule — see github.com/camadkins/promptcite -->';

const CLAUDE_FRONTMATTER = `---
name: receipt
description: Generate a structured AI-use receipt for academic assignments. Conducts a short interview (under 2 minutes) and emits a citation string, plain-language disclosure paragraph, and JSON receipt validated against schema.yaml. Use when the student types /receipt, "generate my AI receipt", or any variant indicating they want to disclose AI use on coursework.
---`;

/**
 * Declarative agent manifest. Adding an agent is a DATA entry here — pick a
 * strategy and give it a detect spec + target path. No new install/uninstall
 * code. Strategies:
 *   - global-skill:  write the rule (with frontmatter) to a user-config path
 *   - rule-drop:     drop a standalone rule file into a per-project rules dir
 *                    (safe — its own file, never clobbers the user's content)
 *   - block-append:  surgically append a begin/end block into a SHARED file
 *                    (AGENTS.md, .goosehints, replit.md, …) so existing
 *                    content is preserved
 *   - cli-extension: shell out to the agent's own extension installer
 *   - hook-register: merge a PostToolUse entry into the agent's hooks config
 *                    (JSON), preserving everything already in the file. Every
 *                    supported agent uses the same hooks shape, so adding one
 *                    is a data entry: give it a path, a base, and a `tool` id.
 * optIn: never installed by `--all`. Reserved for entries that change how the
 *   user's agent behaves rather than just dropping a rule file — those are an
 *   explicit `--only <id>` decision, never a side effect of installing
 *   PromptCite.
 * detect: detected if any `cwdPaths` exist (relative to cwd), any `homePaths`
 *   exist (relative to $HOME), or `command` is found on PATH.
 * requiresInit: per-project write — needs --with-init. onMissingInit:
 *   'hint' logs a friendly note and skips; 'stub' throws StubSkipError.
 *
 * @typedef {Object} AgentSpec
 * @property {string} id
 * @property {string} name
 * @property {'global-skill'|'rule-drop'|'block-append'|'cli-extension'|'hook-register'} strategy
 * @property {{ cwdPaths?: string[], homePaths?: string[], command?: string }} detect
 * @property {'cwd'|'configDir'|'home'} [base]
 * @property {string} [path]
 * @property {string} [display]
 * @property {boolean} [requiresInit]
 * @property {'hint'|'stub'} [onMissingInit]
 * @property {string} [frontmatter]
 * @property {{ bin: string, installArgs: string[], uninstallArgs: string[] }} [cli]
 * @property {boolean} [autoActivates]
 * @property {boolean} [optIn]
 * @property {string} [tool]
 * @property {string} [event]
 * @property {string} [matcher]
 */

/** @type {AgentSpec[]} */
const MANIFEST = [
  // --- core 10 ---
  { id: 'claude', name: 'Claude Code', strategy: 'global-skill', base: 'configDir',
    path: 'skills/promptcite/SKILL.md', frontmatter: CLAUDE_FRONTMATTER,
    display: '~/.claude/skills/promptcite/SKILL.md', detect: { homePaths: ['.claude'] } },
  { id: 'gemini', name: 'Gemini CLI', strategy: 'cli-extension',
    cli: { bin: 'gemini', installArgs: ['extensions', 'install', 'https://github.com/camadkins/promptcite'], uninstallArgs: ['extensions', 'uninstall', 'promptcite'] },
    display: '(gemini CLI extension store)', detect: { command: 'gemini' } },
  { id: 'cursor', name: 'Cursor', strategy: 'rule-drop', base: 'cwd',
    path: '.cursor/rules/promptcite-receipt.md', requiresInit: true, onMissingInit: 'hint', detect: { cwdPaths: ['.cursor'] } },
  { id: 'windsurf', name: 'Windsurf', strategy: 'rule-drop', base: 'cwd',
    path: '.windsurf/rules/promptcite-receipt.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.windsurf'] } },
  { id: 'copilot', name: 'GitHub Copilot', strategy: 'block-append', base: 'cwd',
    path: '.github/copilot-instructions.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.github'] } },
  // AGENTS.md is a shared cross-agent convention — block-append preserves any
  // existing content, and this same file covers Amp / opencode / Crush / Jules.
  { id: 'codex', name: 'Codex CLI', strategy: 'block-append', base: 'cwd',
    path: 'AGENTS.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['AGENTS.md'], homePaths: ['.codex'] } },
  { id: 'cline', name: 'Cline', strategy: 'rule-drop', base: 'cwd',
    path: '.clinerules/promptcite-receipt.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.clinerules', '.cline'] } },
  { id: 'continue', name: 'Continue', strategy: 'rule-drop', base: 'cwd',
    path: '.continue/rules/promptcite-receipt.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.continue'] } },
  { id: 'roo', name: 'Roo Code', strategy: 'rule-drop', base: 'cwd',
    path: '.roo/rules/promptcite-receipt.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.roo'] } },
  // Aider loads CONVENTIONS.md (via .aider.conf.yml 'read:' or --read); shared
  // file, so block-append.
  { id: 'aider', name: 'Aider', strategy: 'block-append', base: 'cwd',
    path: 'CONVENTIONS.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.aider.conf.yml', 'CONVENTIONS.md'], homePaths: ['.aider.conf.yml'] } },

  // --- expansion (researched 2026 conventions) ---
  // rule-drop = own file in a per-project rules dir (no clobber):
  { id: 'amazonq', name: 'Amazon Q Developer', strategy: 'rule-drop', base: 'cwd',
    path: '.amazonq/rules/promptcite-receipt.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.amazonq'], command: 'q' } },
  { id: 'kiro', name: 'Kiro', strategy: 'rule-drop', base: 'cwd',
    path: '.kiro/steering/promptcite-receipt.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.kiro'] } },
  { id: 'augment', name: 'Augment Code', strategy: 'rule-drop', base: 'cwd',
    path: '.augment/rules/promptcite-receipt.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.augment'] } },
  { id: 'trae', name: 'Trae', strategy: 'rule-drop', base: 'cwd',
    path: '.trae/rules/promptcite-receipt.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.trae'] } },
  // block-append = shared single file the user may already own (preserve it):
  { id: 'junie', name: 'JetBrains Junie', strategy: 'block-append', base: 'cwd',
    path: '.junie/guidelines.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.junie'] } },
  { id: 'goose', name: 'Goose', strategy: 'block-append', base: 'cwd',
    path: '.goosehints', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.goosehints', '.goose'], command: 'goose' } },
  { id: 'replit', name: 'Replit Agent', strategy: 'block-append', base: 'cwd',
    path: 'replit.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['replit.md', '.replit'] } },
  { id: 'openhands', name: 'OpenHands', strategy: 'block-append', base: 'cwd',
    path: '.openhands/microagents/repo.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.openhands'] } },
  { id: 'qodo', name: 'Qodo', strategy: 'block-append', base: 'cwd',
    path: 'best_practices.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['best_practices.md', '.qodo', 'agent.toml'] } },
  { id: 'zed', name: 'Zed', strategy: 'block-append', base: 'cwd',
    path: '.rules', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.zed', '.rules'], command: 'zed' } },

  // --- AGENTS.md family: agents that read AGENTS.md natively. Listed as
  //     first-class for discoverability; each detects via its OWN signal but
  //     shares the single AGENTS.md block (block-append is idempotent, so
  //     overlapping installs just no-op). Jules is cloud/GitHub-based with no
  //     local footprint — never auto-detected; install explicitly with --only.
  { id: 'opencode', name: 'opencode', strategy: 'block-append', base: 'cwd',
    path: 'AGENTS.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['opencode.json', '.opencode'], command: 'opencode' } },
  { id: 'amp', name: 'Amp (Sourcegraph)', strategy: 'block-append', base: 'cwd',
    path: 'AGENTS.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['AGENT.md'], command: 'amp' } },
  { id: 'crush', name: 'Crush (Charm)', strategy: 'block-append', base: 'cwd',
    path: 'AGENTS.md', requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['crush.json', '.crush.json'], command: 'crush' } },
  // --- AI-use hook (opt-in only) ---------------------------------------
  //     Never installed by --all. These change how the user's agent behaves,
  //     so they are an explicit `--only <id>` decision. Registering the hook
  //     does not turn anything on by itself — the ledger stays off until the
  //     student enables it in promptcite.config.json (or an instructor policy
  //     requires it). Both agents take the same hooks shape; a third is a
  //     one-line entry here.
  { id: 'claude-hook', name: 'Claude Code (AI-use hook)', strategy: 'hook-register',
    base: 'configDir', path: 'settings.json', optIn: true, tool: 'claude-code',
    display: '~/.claude/settings.json (hooks block)', detect: { homePaths: ['.claude'] } },
  { id: 'codex-hook', name: 'Codex CLI (AI-use hook)', strategy: 'hook-register',
    base: 'home', path: '.codex/hooks.json', optIn: true, tool: 'codex-cli',
    display: '~/.codex/hooks.json', detect: { homePaths: ['.codex'] } },

  { id: 'jules', name: 'Jules (Google)', strategy: 'block-append', base: 'cwd',
    path: 'AGENTS.md', requiresInit: true, onMissingInit: 'stub', detect: {} },
];

/** @param {string} bin @param {string[]} args @returns {Promise<void>} */
function spawnCmd(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${bin} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

/**
 * Resolve a file strategy's on-disk target.
 * @param {InstallContext} ctx @param {any} entry @returns {string}
 */
function targetOf(ctx, entry) {
  const base = entry.base === 'configDir' ? ctx.configDir
    : entry.base === 'home' ? homedir()
      : ctx.cwd;
  return join(base, ...String(entry.path).split('/'));
}

/** Absolute path to the recorder we register. No PATH lookup, no network. */
function hookCommandPath() {
  return fileURLToPath(new URL('./hook.js', import.meta.url));
}

/**
 * A sentinel argument appended to the registered command. `bin/hook.js` ignores
 * unknown flags, so this costs nothing at runtime and gives uninstall an exact
 * way to find our entries — matching on the file path would break the moment
 * someone clones the repo to a differently-named directory.
 */
const HOOK_MARKER = '--id promptcite';

/**
 * Our hook entries are identified by the command they run, so uninstall can
 * remove exactly ours and leave every other hook in the file alone. No schema
 * extension needed, and it works the same in Claude Code's settings.json and
 * Codex's hooks.json.
 * @param {any} hook @returns {boolean}
 */
export function isOurHook(hook) {
  return typeof hook?.command === 'string' && hook.command.includes(HOOK_MARKER);
}

/**
 * Merge our PostToolUse entry into an agent's hooks config, preserving
 * everything already there. Both supported agents use the same shape — Claude
 * Code nests it among other settings keys, Codex gives it its own file — so a
 * third agent is a manifest entry, not new code.
 * @param {any} config @param {any} entry @returns {any}
 */
export function mergeHookConfig(config, entry) {
  const next = config && typeof config === 'object' ? { ...config } : {};
  const hooks = { ...(next.hooks || {}) };
  const event = entry.event || 'PostToolUse';
  const groups = Array.isArray(hooks[event]) ? hooks[event].map((/** @type {any} */ g) => ({ ...g })) : [];

  const ours = {
    type: 'command',
    command: `${hookCommandPath()} --tool ${entry.tool} ${HOOK_MARKER}`,
  };
  const matcher = entry.matcher || 'Write|Edit';

  const existing = groups.find((/** @type {any} */ g) => g.matcher === matcher);
  if (existing) {
    const kept = (existing.hooks || []).filter((/** @type {any} */ h) => !isOurHook(h));
    existing.hooks = [...kept, ours];
  } else {
    groups.push({ matcher, hooks: [ours] });
  }

  hooks[event] = groups;
  next.hooks = hooks;
  return next;
}

/**
 * Remove only our entries, and only empty groups we emptied.
 * @param {any} config @param {any} entry @returns {any}
 */
export function unmergeHookConfig(config, entry) {
  if (!config || typeof config !== 'object' || !config.hooks) return config;
  const next = { ...config };
  const hooks = { ...next.hooks };
  const event = entry.event || 'PostToolUse';
  if (!Array.isArray(hooks[event])) return config;

  const groups = hooks[event]
    .map((/** @type {any} */ g) => ({ ...g, hooks: (g.hooks || []).filter((/** @type {any} */ h) => !isOurHook(h)) }))
    .filter((/** @type {any} */ g) => g.hooks.length > 0);

  if (groups.length) hooks[event] = groups;
  else delete hooks[event];

  if (Object.keys(hooks).length) next.hooks = hooks;
  else delete next.hooks;
  return next;
}

/**
 * Gate a per-project write on --with-init. Returns true to proceed; otherwise
 * handles the missing-init case (friendly hint, or StubSkipError) and the
 * caller stops.
 * @param {InstallContext} ctx @param {any} entry @param {'install'|'uninstall'} action @returns {boolean}
 */
function gateInit(ctx, entry, action) {
  if (!entry.requiresInit || ctx.withInit) return true;
  if (entry.onMissingInit === 'hint') {
    const verb = action === 'uninstall' ? 'remove' : 'drop';
    ctx.log(`${entry.name} uses per-project rules. Re-run with \`--with-init\` inside the target project to ${verb} \`${entry.path}\`.`);
    return false;
  }
  throw new StubSkipError(entry.id);
}

/** @type {Record<string, { install: (ctx: InstallContext, entry: any) => Promise<void>, uninstall: (ctx: InstallContext, entry: any) => Promise<void> }>} */
const STRATEGIES = {
  'global-skill': {
    async install(ctx, entry) {
      const targetPath = targetOf(ctx, entry);
      const ruleBody = await readRuleSource(ctx);
      const content = `${entry.frontmatter}\n\n${ruleBody}`;
      const existing = await ctx.adapter.readFileIfPresent(targetPath);
      if (existing === content) {
        ctx.adapter.log(`already up-to-date: ${targetPath}`);
        return;
      }
      await ctx.adapter.ensureDirectory(dirname(targetPath));
      await ctx.adapter.writeFile(targetPath, content);
    },
    async uninstall(ctx, entry) {
      const skillDir = dirname(targetOf(ctx, entry));
      if (await ctx.adapter.pathExists(skillDir)) {
        await ctx.adapter.deleteDirectory(skillDir);
      }
    },
  },
  'rule-drop': {
    async install(ctx, entry) {
      if (!gateInit(ctx, entry, 'install')) return;
      const ruleBody = await readRuleSource(ctx);
      await dropRuleFile({ adapter: ctx.adapter, targetPath: targetOf(ctx, entry), header: RULE_HEADER, ruleBody });
    },
    async uninstall(ctx, entry) {
      if (!gateInit(ctx, entry, 'uninstall')) return;
      const targetPath = targetOf(ctx, entry);
      if (await ctx.adapter.pathExists(targetPath)) {
        await ctx.adapter.deleteFile(targetPath);
      }
    },
  },
  'block-append': {
    async install(ctx, entry) {
      if (!gateInit(ctx, entry, 'install')) return;
      const ruleBody = await readRuleSource(ctx);
      await appendCopilotBlock({ adapter: ctx.adapter, targetPath: targetOf(ctx, entry), ruleBody });
    },
    async uninstall(ctx, entry) {
      if (!gateInit(ctx, entry, 'uninstall')) return;
      await removeCopilotBlock({ adapter: ctx.adapter, targetPath: targetOf(ctx, entry) });
    },
  },
  'hook-register': {
    async install(ctx, entry) {
      const targetPath = targetOf(ctx, entry);
      const existing = await ctx.adapter.readFileIfPresent(targetPath);

      /** @type {any} */
      let config = {};
      if (existing) {
        try {
          config = JSON.parse(existing);
        } catch {
          // Never overwrite a config we can't parse — that would destroy
          // whatever the user actually has. Bail and let them look.
          throw new UserError(`${targetPath} is not valid JSON; not touching it. Fix or move it, then re-run.`);
        }
        // Back up before the first modification. Cheap insurance on a file the
        // user owns and that their editor depends on.
        const backup = `${targetPath}.promptcite-backup`;
        if (!(await ctx.adapter.pathExists(backup))) {
          await ctx.adapter.writeFile(backup, existing);
        }
      }

      const merged = mergeHookConfig(config, entry);
      const content = `${JSON.stringify(merged, null, 2)}\n`;
      if (content === existing) {
        ctx.adapter.log(`already up-to-date: ${targetPath}`);
        return;
      }
      await ctx.adapter.ensureDirectory(dirname(targetPath));
      await ctx.adapter.writeFile(targetPath, content);
      ctx.adapter.log(`registered the AI-use hook in ${targetPath} (enable it with "ledger": { "enabled": true } in promptcite.config.json)`);
    },
    async uninstall(ctx, entry) {
      const targetPath = targetOf(ctx, entry);
      const existing = await ctx.adapter.readFileIfPresent(targetPath);
      if (!existing) return;

      /** @type {any} */
      let config;
      try {
        config = JSON.parse(existing);
      } catch {
        ctx.adapter.log(`${targetPath} is not valid JSON; leaving it alone.`);
        return;
      }

      const cleaned = unmergeHookConfig(config, entry);
      const content = `${JSON.stringify(cleaned, null, 2)}\n`;
      if (content === existing) return;
      await ctx.adapter.writeFile(targetPath, content);
    },
  },
  'cli-extension': {
    async install(ctx, entry) {
      const { bin, installArgs } = entry.cli;
      if (ctx.dryRun) {
        ctx.adapter.log(`[DRY-RUN] would run: ${bin} ${installArgs.join(' ')}`);
        return;
      }
      ctx.adapter.log(`running: ${bin} ${installArgs.join(' ')}`);
      await spawnCmd(bin, installArgs);
    },
    async uninstall(ctx, entry) {
      const { bin, uninstallArgs } = entry.cli;
      if (ctx.dryRun) {
        ctx.adapter.log(`[DRY-RUN] would run: ${bin} ${uninstallArgs.join(' ')}`);
        return;
      }
      ctx.adapter.log(`running: ${bin} ${uninstallArgs.join(' ')}`);
      await spawnCmd(bin, uninstallArgs);
    },
  },
};

/**
 * Dispatch to a strategy's install/uninstall, guarding an unknown strategy.
 * @param {any} entry @param {'install'|'uninstall'} op @param {InstallContext} ctx @returns {Promise<void>}
 */
function runStrategy(entry, op, ctx) {
  const strategy = STRATEGIES[entry.strategy];
  if (!strategy) throw new Error(`unknown install strategy: ${entry.strategy}`);
  return strategy[op](ctx, entry);
}

/** @param {any} spec @returns {() => boolean} */
function makeDetect(spec) {
  return () => {
    if (spec.command) {
      try { execSync(`command -v ${spec.command}`, { stdio: 'ignore' }); return true; } catch { /* not on PATH */ }
    }
    for (const p of spec.cwdPaths ?? []) if (existsSync(join(process.cwd(), p))) return true;
    for (const p of spec.homePaths ?? []) if (existsSync(join(homedir(), p))) return true;
    return false;
  };
}

/** @type {Provider[]} */
const providers = MANIFEST.map((entry) => ({
  id: entry.id,
  name: entry.name,
  detect: makeDetect(entry.detect),
  install: (/** @type {InstallContext} */ ctx) => runStrategy(entry, 'install', ctx),
  uninstall: (/** @type {InstallContext} */ ctx) => runStrategy(entry, 'uninstall', ctx),
  autoActivates: entry.autoActivates !== false,
  targetPaths: [entry.display ?? entry.path ?? entry.id],
  entry,
}));

const providerById = new Map(providers.map((provider) => [provider.id, provider]));

async function readPackageVersion() {
  const pkgPath = resolve(__dirname, '..', 'package.json');
  const pkgRaw = await readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(pkgRaw);
  return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
}

async function printVersion() {
  const v = await readPackageVersion();
  console.log(v);
}

function printList() {
  console.log('PromptCite — supported agents');
  console.log('');
  console.log('| id        | name                | detected | auto-activates |');
  console.log('|-----------|---------------------|----------|----------------|');
  // optIn entries are add-ons, not agents — listed separately below so the
  // agent count stays meaningful and nobody mistakes them for something --all
  // would install.
  const agents = providers.filter((p) => !p.entry.optIn);
  const addOns = providers.filter((p) => p.entry.optIn);

  for (const p of agents) {
    const detected = p.detect() ? 'yes' : 'no';
    const auto = p.autoActivates ? 'yes' : 'no';
    console.log(`| ${p.id.padEnd(9)} | ${p.name.padEnd(19)} | ${detected.padEnd(8)} | ${auto.padEnd(14)} |`);
  }
  const detectedCount = agents.filter((p) => p.detect()).length;
  console.log('');
  console.log(`Detected ${detectedCount} of ${agents.length} agents on this machine.`);

  if (addOns.length) {
    console.log('');
    console.log('Optional add-ons — install one explicitly, never included in --all:');
    for (const p of addOns) {
      console.log(`  promptcite --only ${p.id.padEnd(12)} ${p.name} → ${p.entry.display}`);
    }
    console.log('');
    console.log('  Registering the hook turns nothing on by itself. The ledger stays off');
    console.log('  until you enable it in promptcite.config.json. See /receipt help.');
  }
}

/**
 * Diagnose an install: for each provider, report detection and whether its
 * rule artifact is present and up-to-date vs the current rule. Read-only,
 * no network. Drift is detected by checking whether the installed file still
 * contains the current rule body (works for all three adapter strategies).
 * @param {InstallContext} ctx
 */
async function runDoctor(ctx) {
  const ruleNeedle = (await readRuleSource(ctx)).trim();
  ctx.log('PromptCite — doctor');
  ctx.log('');
  ctx.log('| id        | name                | detected | rule artifact        |');
  ctx.log('|-----------|---------------------|----------|----------------------|');
  for (const p of providers) {
    const detected = p.detect() ? 'yes' : 'no';
    const e = p.entry;
    let artifact;
    if (e.strategy === 'cli-extension') {
      artifact = 'CLI-managed';
    } else {
      const content = await readFileIfPresent(targetOf(ctx, e));
      if (content === null) artifact = 'missing';
      else if (content.includes(ruleNeedle)) artifact = 'up-to-date';
      else artifact = 'STALE (re-install)';
    }
    ctx.log(`| ${p.id.padEnd(9)} | ${p.name.padEnd(19)} | ${detected.padEnd(8)} | ${artifact.padEnd(20)} |`);
  }
  ctx.log('');
  const cfg = await pathExists(join(ctx.cwd, 'promptcite.config.json'));
  const pol = await pathExists(join(ctx.cwd, 'promptcite.policy.json'));
  ctx.log(`promptcite.config.json in cwd: ${cfg ? 'yes' : 'no'}`);
  ctx.log(`promptcite.policy.json in cwd: ${pol ? 'yes' : 'no'}`);
  ctx.log('');
  ctx.log('Rule artifacts marked STALE: re-run the installer for that agent to refresh.');
}

async function printRule() {
  const target = resolve(__dirname, '..', 'src', 'rules', 'receipt.md');
  const body = await readFile(target, 'utf8');
  // Universal fallback: any agent NOT in `--list` can still run PromptCite
  // if a human drops this rule into wherever that agent reads its custom
  // instructions / system prompt / rules file. No adapter code required.
  console.log('<!-- PromptCite /receipt rule — universal install -->');
  console.log("<!-- For any agent not covered by 'promptcite --list': paste everything below");
  console.log('     into that agent\'s custom-instructions / rules / system-prompt file. -->');
  console.log('');
  console.log(body);
}

/**
 * Scaffold a starter promptcite.config.json in the cwd so the student can
 * set consistent-across-sessions defaults (citation style, etc.) that
 * /receipt reads to skip repeat questions. Personal fields are left out so
 * the agent still asks for them; add them via /receipt settings.
 * @param {InstallContext} ctx
 */
async function writeStarterConfig(ctx) {
  const targetPath = join(ctx.cwd, 'promptcite.config.json');
  const existing = await ctx.adapter.readFileIfPresent(targetPath);
  if (existing && !ctx.force) {
    ctx.log(`${c.yellow('exists:')} ${targetPath} (use --force to overwrite, or edit it / run /receipt settings)`);
    return;
  }
  const starter = JSON.stringify({ citation_style: 'MLA', flow: 'full' }, null, 2) + '\n';
  await ctx.adapter.writeFile(targetPath, starter);
  ctx.log('Set consistent defaults here (citation_style, student, default_course,');
  ctx.log('default_instructor, flow) so /receipt stops re-asking — or run /receipt settings.');
}

async function printHelp() {
  const v = await readPackageVersion();
  console.log(`promptcite ${v} — cross-agent /receipt installer

USAGE
  promptcite [options]
  npx -y github:camadkins/promptcite [options]

OPTIONS
  -h, --help                 Show this help and exit
  -v, --version              Print version and exit
      --list                 List supported agents and detection state
      --doctor               Diagnose install: detection + rule-file drift; writes nothing
      --print-rule, --manual Print the /receipt rule to stdout (universal install
                             for any agent not in --list); writes nothing
      --init-config          Scaffold a starter promptcite.config.json in the cwd
      --dry-run              Print what would be done; write nothing
      --only <id>            Install only for the named agent
      --all                  Install for every detected agent (default when --only is absent)
      --with-init            Also drop rule files into the current repo
      --uninstall            Remove all installed components
      --non-interactive      Skip all prompts (default when stdin is not a TTY)
      --no-color             Disable ANSI color output (also honors NO_COLOR)
      --config-dir <path>    Override Claude Code config dir (default: $CLAUDE_CONFIG_DIR or ~/.claude)
      --force                Re-run even if already installed

EXAMPLES
  promptcite --list
  promptcite --dry-run --all
  promptcite --only claude
  promptcite --with-init --only cursor
  promptcite --doctor                            # check what's installed + drift
  promptcite --print-rule > my-agent-rules.md   # any agent, even unlisted
  promptcite --init-config                       # scaffold promptcite.config.json
  promptcite --uninstall

EXIT CODES
  0  success
  1  user error (unknown flag, bad value)
  2  internal error

DOCS  https://github.com/camadkins/promptcite`);
}

/**
 * @param {string[]} argv
 */
function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      list: { type: 'boolean' },
      doctor: { type: 'boolean' },
      'print-rule': { type: 'boolean' },
      manual: { type: 'boolean' },
      'init-config': { type: 'boolean' },
      only: { type: 'string' },
      all: { type: 'boolean' },
      'with-init': { type: 'boolean' },
      force: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      uninstall: { type: 'boolean' },
      'non-interactive': { type: 'boolean' },
      'no-color': { type: 'boolean' },
      'config-dir': { type: 'string' },
    },
  });

  const only = values.only ?? null;
  if (only && !providerById.has(only)) {
    throw new UserError(`unknown provider "${only}". Expected one of: ${providers.map((provider) => provider.id).join(', ')}`);
  }

  if (values['no-color'] === true || process.env.NO_COLOR) {
    /** @type {ColorFn} */
    const identity = (text) => text;
    c.bold = c.dim = c.red = c.green = c.yellow = c.blue = c.cyan = c.gray = identity;
  }

  return {
    help: values.help === true,
    version: values.version === true,
    list: values.list === true,
    doctor: values.doctor === true,
    printRule: values['print-rule'] === true || values.manual === true,
    initConfig: values['init-config'] === true,
    only,
    all: only === null,
    withInit: values['with-init'] === true,
    force: values.force === true,
    dryRun: values['dry-run'] === true,
    uninstall: values.uninstall === true,
    nonInteractive: values['non-interactive'] === true || !process.stdin.isTTY,
    configDir: values['config-dir'] ?? null,
  };
}

/**
 * @param {{ withInit: boolean, force: boolean, dryRun: boolean, configDir: string | null }} parsed
 * @returns {InstallContext}
 */
function buildContext(parsed) {
  /** @type {(msg: string) => void} */
  const log = (msg) => console.log(msg);
  const adapter = parsed.dryRun ? createDryRunAdapter(log) : createRealAdapter(log);
  const configDir = parsed.configDir
    ?? process.env.CLAUDE_CONFIG_DIR
    ?? join(homedir(), '.claude');
  return {
    configDir,
    repoRoot: resolve(__dirname, '..'),
    cwd: process.cwd(),
    withInit: parsed.withInit,
    force: parsed.force,
    dryRun: parsed.dryRun,
    log,
    adapter,
  };
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * @param {{ only: string | null }} parsed
 * @returns {{ selected: Provider[], skipped: Provider[] }}
 */
function selectProviders(parsed) {
  if (parsed.only) {
    const provider = providerById.get(parsed.only);
    if (!provider) {
      throw new UserError(`unknown provider "${parsed.only}"`);
    }
    // --only is an explicit user choice — install regardless of detection.
    return { selected: [provider], skipped: [] };
  }
  // --all mode: only install for agents actually detected on this machine
  // (per spec sect 3.1 "auto-detects installed agents"). Undetected agents
  // are reported via the skipped list and the user is informed.
  //
  // optIn entries are excluded entirely. They modify the user's agent config
  // rather than dropping a rule file, and nobody installing PromptCite should
  // get that as a side effect — it is always an explicit `--only <id>`.
  const eligible = providers.filter((p) => !p.entry.optIn);
  const selected = eligible.filter((p) => p.detect());
  const skipped = eligible.filter((p) => !p.detect());
  return { selected, skipped };
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
async function main(argv) {
  let parsed;
  try {
    parsed = parseCli(argv);
  } catch (error) {
    console.error(`${c.red('error:')} ${formatError(error)}`);
    return 2;
  }

  if (parsed.help) {
    await printHelp();
    return 0;
  }

  if (parsed.version) {
    await printVersion();
    return 0;
  }

  if (parsed.list) {
    printList();
    return 0;
  }

  if (parsed.printRule) {
    await printRule();
    return 0;
  }

  const ctx = buildContext(parsed);

  if (parsed.doctor) {
    await runDoctor(ctx);
    return 0;
  }

  if (parsed.initConfig) {
    await writeStarterConfig(ctx);
    return 0;
  }
  const { selected: selectedProviders, skipped: undetectedProviders } = selectProviders(parsed);
  const allMode = parsed.all === true;
  const action = parsed.uninstall ? 'uninstall' : 'install';
  let successCount = 0;
  let skipCount = 0;

  // Inform user about agents we're skipping because they're not detected.
  // Only relevant in --all mode; --only never produces skipped entries.
  for (const provider of undetectedProviders) {
    skipCount += 1;
    ctx.log(`${c.dim('not detected')} ${provider.id} (skipping)`);
  }

  for (const provider of selectedProviders) {
    try {
      if (parsed.uninstall) {
        await provider.uninstall(ctx);
      } else {
        await provider.install(ctx);
      }
      successCount += 1;
    } catch (error) {
      if (error instanceof StubSkipError) {
        if (allMode) {
          skipCount += 1;
          ctx.log(`${c.yellow('skipping')} ${provider.id}: ${STUB_MESSAGE(provider.id)}`);
          continue;
        }
        console.error(`${c.red('error:')} ${STUB_MESSAGE(provider.id)}`);
        return 2;
      }

      console.error(`${c.red('error:')} ${action} failed for ${provider.id}: ${formatError(error)}`);
      return 2;
    }
  }

  if (parsed.uninstall) {
    const summary = `${c.green('uninstalled.')} ${successCount} agent(s) processed.`;
    ctx.log(skipCount > 0 ? `${summary} ${skipCount} skipped.` : summary);
    return 0;
  }

  const summary = `${c.green('installed.')} ${successCount} agent(s) processed.`;
  ctx.log(skipCount > 0 ? `${summary} ${skipCount} skipped.` : summary);

  if (successCount > 0) {
    ctx.log('');
    ctx.log(`${c.bold('next:')} open a fresh session in your agent and type ${c.cyan('/receipt')} to try it.`);
    ctx.log(`docs: https://github.com/camadkins/promptcite`);
  }
  return 0;
}

const code = await main(process.argv.slice(2));
process.exit(code);
