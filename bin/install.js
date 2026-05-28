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
    await access(target);
  } catch {
    throw new Error(`rule source missing at ${target}`);
  }
  return readFile(target, 'utf8');
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

/**
 * @param {string} id
 * @returns {Provider}
 */
function createStubProvider(id) {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    detect: () => false,
    async install() {
      throw new StubSkipError(id);
    },
    async uninstall() {
      throw new StubSkipError(id);
    },
    autoActivates: false,
    targetPaths: [id],
  };
}

/** @type {Provider[]} */
const providers = [
  {
    id: 'claude',
    name: 'Claude Code',
    detect: () => existsSync(join(homedir(), '.claude')),
    async install(ctx) {
      const targetPath = join(ctx.configDir, 'skills', 'promptcite', 'SKILL.md');
      const ruleBody = await readRuleSource(ctx);
      const frontmatter = `---
name: receipt
description: Generate a structured AI-use receipt for academic assignments. Conducts a short interview (under 2 minutes) and emits a citation string, plain-language disclosure paragraph, and JSON receipt validated against schema.yaml. Use when the student types /receipt, "generate my AI receipt", or any variant indicating they want to disclose AI use on coursework.
---`;
      const content = `${frontmatter}\n\n${ruleBody}`;
      const existing = await ctx.adapter.readFileIfPresent(targetPath);
      if (existing === content) {
        ctx.adapter.log(`already up-to-date: ${targetPath}`);
        return;
      }
      await ctx.adapter.ensureDirectory(dirname(targetPath));
      await ctx.adapter.writeFile(targetPath, content);
      // TODO(installer-adapters): defer ~/.claude/settings.json JSONC merge for hook registration to a separate pass
    },
    async uninstall(ctx) {
      const skillDir = join(ctx.configDir, 'skills', 'promptcite');
      if (await ctx.adapter.pathExists(skillDir)) {
        await ctx.adapter.deleteDirectory(skillDir);
      }
    },
    autoActivates: true,
    targetPaths: ['~/.claude/skills/promptcite/SKILL.md'],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    detect: () => {
      try {
        execSync('command -v gemini', { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    },
    async install(ctx) {
      const repoUrl = 'https://github.com/camadkins/promptcite';
      if (ctx.dryRun) {
        ctx.adapter.log(`[DRY-RUN] would run: gemini extensions install ${repoUrl}`);
        return;
      }
      ctx.adapter.log(`running: gemini extensions install ${repoUrl}`);
      await new Promise((resolve, reject) => {
        const proc = spawn('gemini', ['extensions', 'install', repoUrl], {
          stdio: 'inherit',
        });
        proc.on('error', reject);
        proc.on('exit', (code) => {
          if (code === 0) resolve(undefined);
          else reject(new Error(`gemini extensions install exited with code ${code}`));
        });
      });
    },
    async uninstall(ctx) {
      if (ctx.dryRun) {
        ctx.adapter.log('[DRY-RUN] would run: gemini extensions uninstall promptcite');
        return;
      }
      ctx.adapter.log('running: gemini extensions uninstall promptcite');
      await new Promise((resolve, reject) => {
        const proc = spawn('gemini', ['extensions', 'uninstall', 'promptcite'], {
          stdio: 'inherit',
        });
        proc.on('error', reject);
        proc.on('exit', (code) => {
          if (code === 0) resolve(undefined);
          else reject(new Error(`gemini extensions uninstall exited with code ${code}`));
        });
      });
    },
    autoActivates: true,
    targetPaths: ['(gemini CLI extension store)'],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    detect: () => existsSync(join(process.cwd(), '.cursor')),
    async install(ctx) {
      if (!ctx.withInit) {
        ctx.log('Cursor uses per-project rules. Re-run with `--with-init` inside the target project to drop `.cursor/rules/promptcite-receipt.md`.');
        return;
      }
      const targetPath = join(ctx.cwd, '.cursor', 'rules', 'promptcite-receipt.md');
      const ruleBody = await readRuleSource(ctx);
      const header = '<!-- PromptCite /receipt rule — see github.com/camadkins/promptcite -->';
      await dropRuleFile({ adapter: ctx.adapter, targetPath, header, ruleBody });
    },
    async uninstall(ctx) {
      if (!ctx.withInit) {
        ctx.log('Cursor uninstall is per-project. Re-run with `--with-init` inside the target project to remove `.cursor/rules/promptcite-receipt.md`.');
        return;
      }
      const targetPath = join(ctx.cwd, '.cursor', 'rules', 'promptcite-receipt.md');
      if (await ctx.adapter.pathExists(targetPath)) {
        await ctx.adapter.deleteFile(targetPath);
      }
    },
    autoActivates: true,
    targetPaths: ['.cursor/rules/promptcite-receipt.md'],
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    detect: () => existsSync(join(process.cwd(), '.windsurf')),
    async install(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('windsurf');
      }
      const targetPath = join(ctx.cwd, '.windsurf', 'rules', 'promptcite-receipt.md');
      const ruleBody = await readRuleSource(ctx);
      const header = '<!-- PromptCite /receipt rule — see github.com/camadkins/promptcite -->';
      await dropRuleFile({ adapter: ctx.adapter, targetPath, header, ruleBody });
    },
    async uninstall(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('windsurf');
      }
      const targetPath = join(ctx.cwd, '.windsurf', 'rules', 'promptcite-receipt.md');
      if (await ctx.adapter.pathExists(targetPath)) {
        await ctx.adapter.deleteFile(targetPath);
      }
    },
    autoActivates: true,
    targetPaths: ['.windsurf/rules/promptcite-receipt.md'],
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    detect: () => existsSync(join(process.cwd(), '.github')),
    async install(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('copilot');
      }
      const targetPath = join(ctx.cwd, '.github', 'copilot-instructions.md');
      const ruleBody = await readRuleSource(ctx);
      await appendCopilotBlock({ adapter: ctx.adapter, targetPath, ruleBody });
    },
    async uninstall(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('copilot');
      }
      const targetPath = join(ctx.cwd, '.github', 'copilot-instructions.md');
      await removeCopilotBlock({ adapter: ctx.adapter, targetPath });
    },
    autoActivates: true,
    targetPaths: ['.github/copilot-instructions.md'],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    detect: () => existsSync(join(process.cwd(), 'AGENTS.md')) || existsSync(join(homedir(), '.codex')),
    async install(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('codex');
      }
      // AGENTS.md uses surgical begin/end block append, like Copilot's
      // .github/copilot-instructions.md, because AGENTS.md is a
      // shared-convention file (multiple agents respect it) and we must
      // preserve any existing content the user has there.
      const targetPath = join(ctx.cwd, 'AGENTS.md');
      const ruleBody = await readRuleSource(ctx);
      await appendCopilotBlock({ adapter: ctx.adapter, targetPath, ruleBody });
    },
    async uninstall(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('codex');
      }
      const targetPath = join(ctx.cwd, 'AGENTS.md');
      await removeCopilotBlock({ adapter: ctx.adapter, targetPath });
    },
    autoActivates: true,
    targetPaths: ['AGENTS.md'],
  },
  {
    id: 'cline',
    name: 'Cline',
    detect: () => existsSync(join(process.cwd(), '.clinerules')) || existsSync(join(process.cwd(), '.cline')),
    async install(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('cline');
      }
      const targetPath = join(ctx.cwd, '.clinerules', 'promptcite-receipt.md');
      const ruleBody = await readRuleSource(ctx);
      const header = '<!-- PromptCite /receipt rule — see github.com/camadkins/promptcite -->';
      await dropRuleFile({ adapter: ctx.adapter, targetPath, header, ruleBody });
    },
    async uninstall(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('cline');
      }
      const targetPath = join(ctx.cwd, '.clinerules', 'promptcite-receipt.md');
      if (await ctx.adapter.pathExists(targetPath)) {
        await ctx.adapter.deleteFile(targetPath);
      }
    },
    autoActivates: true,
    targetPaths: ['.clinerules/promptcite-receipt.md'],
  },
  {
    id: 'continue',
    name: 'Continue',
    detect: () => existsSync(join(process.cwd(), '.continue')),
    async install(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('continue');
      }
      const targetPath = join(ctx.cwd, '.continue', 'rules', 'promptcite-receipt.md');
      const ruleBody = await readRuleSource(ctx);
      const header = '<!-- PromptCite /receipt rule — see github.com/camadkins/promptcite -->';
      await dropRuleFile({ adapter: ctx.adapter, targetPath, header, ruleBody });
    },
    async uninstall(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('continue');
      }
      const targetPath = join(ctx.cwd, '.continue', 'rules', 'promptcite-receipt.md');
      if (await ctx.adapter.pathExists(targetPath)) {
        await ctx.adapter.deleteFile(targetPath);
      }
    },
    autoActivates: true,
    targetPaths: ['.continue/rules/promptcite-receipt.md'],
  },
  {
    id: 'roo',
    name: 'Roo Code',
    detect: () => existsSync(join(process.cwd(), '.roo')),
    async install(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('roo');
      }
      const targetPath = join(ctx.cwd, '.roo', 'rules', 'promptcite-receipt.md');
      const ruleBody = await readRuleSource(ctx);
      const header = '<!-- PromptCite /receipt rule — see github.com/camadkins/promptcite -->';
      await dropRuleFile({ adapter: ctx.adapter, targetPath, header, ruleBody });
    },
    async uninstall(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('roo');
      }
      const targetPath = join(ctx.cwd, '.roo', 'rules', 'promptcite-receipt.md');
      if (await ctx.adapter.pathExists(targetPath)) {
        await ctx.adapter.deleteFile(targetPath);
      }
    },
    autoActivates: true,
    targetPaths: ['.roo/rules/promptcite-receipt.md'],
  },
  {
    id: 'aider',
    name: 'Aider',
    detect: () => existsSync(join(process.cwd(), '.aider.conf.yml')) || existsSync(join(homedir(), '.aider.conf.yml')) || existsSync(join(process.cwd(), 'CONVENTIONS.md')),
    async install(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('aider');
      }
      // Aider loads CONVENTIONS.md when configured via .aider.conf.yml
      // ('read: CONVENTIONS.md') or via --read CONVENTIONS.md at startup.
      // We drop CONVENTIONS.md and use surgical begin/end block append
      // to preserve any existing convention content the user has there.
      const targetPath = join(ctx.cwd, 'CONVENTIONS.md');
      const ruleBody = await readRuleSource(ctx);
      await appendCopilotBlock({ adapter: ctx.adapter, targetPath, ruleBody });
    },
    async uninstall(ctx) {
      if (!ctx.withInit) {
        throw new StubSkipError('aider');
      }
      const targetPath = join(ctx.cwd, 'CONVENTIONS.md');
      await removeCopilotBlock({ adapter: ctx.adapter, targetPath });
    },
    autoActivates: true,
    targetPaths: ['CONVENTIONS.md'],
  },
];

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
  console.log('| id       | name           | detected | auto-activates |');
  console.log('|----------|----------------|----------|----------------|');
  for (const p of providers) {
    const detected = p.detect() ? 'yes' : 'no';
    const auto = p.autoActivates ? 'yes' : 'no';
    console.log(`| ${p.id.padEnd(8)} | ${p.name.padEnd(14)} | ${detected.padEnd(8)} | ${auto.padEnd(14)} |`);
  }
  const detectedCount = providers.filter((p) => p.detect()).length;
  console.log('');
  console.log(`Detected ${detectedCount} of ${providers.length} agents on this machine.`);
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
  const selected = providers.filter((p) => p.detect());
  const skipped = providers.filter((p) => !p.detect());
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

  const ctx = buildContext(parsed);
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
