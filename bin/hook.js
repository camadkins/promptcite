#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins
//
// PromptCite hook — records AI-insertion events to a local ledger so
// `/receipt` doesn't have to ask the student to reconstruct their AI use from
// memory. Optionally writes a short marker comment above inserted code.
//
// Reads one hook envelope as JSON on stdin. Both Claude Code and Codex CLI
// emit the same shape, so one binary serves both; any agent that can run a
// command on a post-tool event and hand it that JSON works without changes.
//
//   promptcite-hook --tool claude-code
//
// Design constraints, all load-bearing (see docs/adr/0006-*.md):
//   - PostToolUse only. Nothing here can block, alter, or auto-approve a tool
//     call. Rewriting tool input at PreToolUse would require emitting an
//     "allow" permission decision, which silently approves file writes the
//     student would otherwise be asked about. Not worth it for a comment.
//   - Off by default. Both the ledger and markers require opt-in.
//   - Never fails loudly. Any error exits 0 in silence; a disclosure tool must
//     not be the reason someone's editor stops working.
//   - No network, no telemetry, zero dependencies.

import { randomBytes, createHash } from 'node:crypto';
import {
  appendFileSync, mkdirSync, readFileSync, existsSync, realpathSync,
  openSync, closeSync, fstatSync, ftruncateSync, writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, extname, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {'line'|'block'} MarkerStyle
 *
 * @typedef {Object} LedgerEvent
 * @property {string} schema_version
 * @property {string} event_id
 * @property {string} ts
 * @property {string} tool
 * @property {string} file
 * @property {number} lines_added
 * @property {string} [model]
 *
 * @typedef {Object} HookPayload
 * @property {string} [hook_event_name]
 * @property {string} [tool_name]
 * @property {Record<string, any>} [tool_input]
 * @property {string} [model]
 * @property {string} [cwd]
 */

export const LEDGER_SCHEMA_VERSION = '1.0';
const DEFAULT_TTL_DAYS = 30;
const DEFAULT_MIN_LINES = 5;

/** Tool names that represent an AI writing into a file. */
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'str_replace_editor', 'apply_patch']);

/**
 * Line-comment syntax by file extension. Deliberately conservative and
 * deliberately DATA — a parser per language would break ADR 0004 (zero runtime
 * dependencies). Extensions whose comment syntax is ambiguous (`.m` is both
 * Objective-C and MATLAB) or whose files are markup rather than code are
 * omitted; an unknown extension simply means no marker.
 *
 * @type {Record<string, string>}
 */
const LINE_COMMENT = {
  '.js': '//', '.mjs': '//', '.cjs': '//', '.jsx': '//', '.ts': '//', '.tsx': '//',
  '.java': '//', '.c': '//', '.h': '//', '.cpp': '//', '.hpp': '//', '.cc': '//',
  '.cs': '//', '.go': '//', '.rs': '//', '.swift': '//', '.kt': '//', '.kts': '//',
  '.scala': '//', '.php': '//', '.dart': '//', '.zig': '//', '.groovy': '//', '.sol': '//',
  '.py': '#', '.rb': '#', '.sh': '#', '.bash': '#', '.zsh': '#', '.pl': '#',
  '.r': '#', '.jl': '#', '.ex': '#', '.exs': '#', '.nim': '#', '.cr': '#',
  '.sql': '--', '.hs': '--', '.lua': '--', '.elm': '--',
  '.clj': ';', '.cljs': ';', '.el': ';', '.scm': ';', '.lisp': ';',
};

/** Extensions where a `/** … *\/` block marker is well-formed. */
const BLOCK_COMMENT_OK = new Set(
  Object.keys(LINE_COMMENT).filter((ext) => LINE_COMMENT[ext] === '//'),
);

/**
 * Ledger path for a working directory. Outside any repository, always — a
 * record of AI use sitting in a working tree can be swept into a submission or
 * demanded from a repo, and PromptCite must not be able to testify against the
 * student who installed it. The directory is hashed rather than stored so the
 * ledger filename doesn't leak the student's folder layout.
 *
 * @param {string} cwd
 * @param {string} [home]
 */
export function resolveLedgerPath(cwd, home = homedir()) {
  // realpath, so a directory reached through a symlink (macOS /var → /private/var,
  // a symlinked course folder) resolves to the same ledger every time.
  let real = resolve(cwd);
  try {
    real = realpathSync(real);
  } catch {
    // Directory may not exist yet; the resolved path is a good enough key.
  }
  const hash = createHash('sha256').update(real).digest('hex').slice(0, 16);
  return join(home, '.promptcite', 'ledgers', `${hash}.jsonl`);
}

/** @param {string} path */
function readJsonIfPresent(path) {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  } catch {
    return null; // malformed config is ignored, never fatal
  }
}

/**
 * Merge student settings with instructor policy. Policy wins on conflict, the
 * same precedence `/receipt` already applies (see CONTEXT.md glossary). Both
 * features are off unless something turns them on.
 *
 * @param {string} cwd
 */
export function loadConfig(cwd) {
  const settings = readJsonIfPresent(join(cwd, 'promptcite.config.json')) || {};
  const policy = readJsonIfPresent(join(cwd, 'promptcite.policy.json')) || {};
  const ledger = settings.ledger || {};
  const markers = settings.markers || {};
  return {
    ledgerEnabled: policy.require_ledger === true || ledger.enabled === true,
    markersEnabled: policy.require_markers === true || markers.enabled === true,
    ttlDays: Number.isFinite(ledger.ttl_days) ? ledger.ttl_days : DEFAULT_TTL_DAYS,
    minLines: Number.isFinite(markers.min_lines) ? markers.min_lines : DEFAULT_MIN_LINES,
    style: /** @type {MarkerStyle} */ (markers.style === 'block' ? 'block' : 'line'),
  };
}

/**
 * The text an AI just put into a file, or null if this tool didn't do that.
 *
 * @param {string} [toolName]
 * @param {Record<string, any>} [toolInput]
 * @returns {string | null}
 */
export function insertedTextOf(toolName, toolInput) {
  if (!toolInput || !toolName || !WRITE_TOOLS.has(toolName)) return null;
  if (typeof toolInput.content === 'string') return toolInput.content;
  if (typeof toolInput.new_string === 'string') return toolInput.new_string;
  if (Array.isArray(toolInput.edits)) {
    const joined = toolInput.edits.map((/** @type {any} */ e) => e?.new_string || '').join('\n');
    return joined || null;
  }
  return null;
}

/**
 * @param {Object} args
 * @param {string} args.tool
 * @param {string} [args.model]
 * @param {string} args.file
 * @param {string} args.text
 * @param {Date} [args.now]
 * @returns {LedgerEvent}
 */
export function buildEvent({ tool, model, file, text, now = new Date() }) {
  /** @type {LedgerEvent} */
  const event = {
    schema_version: LEDGER_SCHEMA_VERSION,
    event_id: randomBytes(3).toString('hex').slice(0, 5),
    ts: now.toISOString(),
    tool,
    file,
    lines_added: text.split('\n').length,
  };
  // Absent rather than guessed — the schema makes model optional for exactly
  // this reason, and a fabricated model name in a disclosure is worse than none.
  if (model) event.model = model;
  return event;
}

/**
 * Drop events past their TTL. Applied when the ledger is *read*, never when it
 * is written — the hook is append-only on purpose (see `appendEvent`), so this
 * exists for consumers: `/receipt` ignores expired events and purges what it
 * consumes.
 *
 * @param {string[]} lines
 * @param {number} ttlDays
 * @param {Date} [now]
 */
export function pruneExpired(lines, ttlDays, now = new Date()) {
  const cutoff = now.getTime() - ttlDays * 86400000;
  return lines.filter((line) => {
    try {
      return new Date(JSON.parse(line).ts).getTime() >= cutoff;
    } catch {
      return false; // unparseable lines are dropped, never fatal
    }
  });
}

/**
 * Append one event. Strictly append-only, and that is a correctness
 * requirement rather than a simplification: agents run tools in parallel, so
 * several hook processes can be writing this file at the same moment. An
 * earlier version read the whole ledger, dropped expired lines, and wrote it
 * back before appending — which silently destroys any event another process
 * appended between the read and the write.
 *
 * `appendFileSync` opens with O_APPEND, so concurrent writes of a single short
 * line interleave safely instead of overwriting each other. TTL is applied by
 * the reader (`/receipt` already ignores events older than `ttl_days` and
 * purges what it consumes), so nothing here needs to rewrite the file.
 *
 * @param {string} ledgerPath
 * @param {LedgerEvent} event
 */
function appendEvent(ledgerPath, event) {
  mkdirSync(join(ledgerPath, '..'), { recursive: true });
  appendFileSync(ledgerPath, `${JSON.stringify(event)}\n`);
}

/**
 * Add a marker to a file without racing the agent that just wrote it.
 *
 * Checking the path and then acting on the path is two operations on something
 * that can change in between. Here that matters more than usual: this is the
 * student's source file, and losing a write means losing their code, not a log
 * line. So we hold one descriptor for the whole read-modify-write, and confirm
 * through that same descriptor that nothing changed underneath us before
 * committing. If anything looks different, we skip — a missing marker is
 * harmless, a clobbered file is not.
 *
 * @param {string} filePath
 * @param {(contents: string) => string | null} transform
 * @returns {boolean} whether the file was modified
 */
function rewriteIfUnchanged(filePath, transform) {
  /** @type {number | undefined} */
  let fd;
  try {
    fd = openSync(filePath, 'r+');
    const before = fstatSync(fd);
    const contents = readFileSync(fd, 'utf8');
    const next = transform(contents);
    if (next === null || next === contents) return false;

    // Same descriptor, so this is the file we read — not whatever the path
    // points at now.
    const after = fstatSync(fd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      debug('file changed while we were reading it; leaving it alone');
      return false;
    }

    const buffer = Buffer.from(next, 'utf8');
    ftruncateSync(fd, 0);
    writeSync(fd, buffer, 0, buffer.length, 0);
    return true;
  } catch {
    return false; // unreadable, unwritable, or gone — never fatal
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* already closed */ }
  }
}

/**
 * @param {string} file
 * @param {MarkerStyle} style
 * @returns {{ kind: 'line', token: string } | { kind: 'block' } | null}
 */
export function commentFor(file, style) {
  const ext = extname(file).toLowerCase();
  const token = LINE_COMMENT[ext];
  if (!token) return null;
  if (style === 'block' && BLOCK_COMMENT_OK.has(ext)) return { kind: 'block' };
  return { kind: 'line', token };
}

/** @param {LedgerEvent} event */
export function markerText(event) {
  const date = event.ts.slice(0, 10);
  const model = event.model ? ` ${event.model}` : '';
  return `@ai-assisted ${date}${model} via PromptCite (pc:${event.event_id})`;
}

/**
 * Whether an insertion earns a marker. Every guard fails closed: when in doubt
 * we leave the file alone, because a marker that shouldn't be there is a false
 * statement in someone's submitted work.
 *
 * @param {Object} args
 * @param {string} [args.toolName]
 * @param {string} args.text
 * @param {string} args.file
 * @param {string} args.contents
 * @param {number} args.minLines
 * @param {MarkerStyle} args.style
 */
export function shouldMark({ toolName, text, file, contents, minLines, style }) {
  if (toolName !== 'Edit') return false;          // whole-file writes would mark everything
  if (!text || text.split('\n').length < minLines) return false;
  if (text.includes('pc:')) return false;          // already marked; re-edit is idempotent
  if (!commentFor(file, style)) return false;      // unknown or ambiguous comment syntax
  const first = contents.indexOf(text);
  if (first === -1) return false;                  // text isn't in the file as written
  if (contents.indexOf(text, first + 1) !== -1) return false; // ambiguous target
  if (first !== 0 && contents[first - 1] !== '\n') return false; // mid-line insertion
  return true;
}

/**
 * Insert the marker on its own line above `text`, matching its indentation.
 *
 * @param {string} contents
 * @param {string} text
 * @param {LedgerEvent} event
 * @param {MarkerStyle} style
 */
export function injectMarker(contents, text, event, style) {
  const at = contents.indexOf(text);
  const indent = (text.match(/^[ \t]*/) || [''])[0];
  const body = markerText(event);
  const comment = commentFor(event.file, style);
  if (!comment) return contents;
  const line = comment.kind === 'block'
    ? `${indent}/** ${body} */\n`
    : `${indent}${comment.token} ${body}\n`;
  return contents.slice(0, at) + line + contents.slice(at);
}

/** @param {string} message */
function debug(message) {
  if (process.env.PROMPTCITE_DEBUG === '1') process.stderr.write(`promptcite-hook: ${message}\n`);
}

/**
 * @param {HookPayload} payload
 * @param {{ tool?: string, cwd?: string }} [options]
 */
export function run(payload, { tool = 'unknown', cwd: rawCwd = process.cwd() } = {}) {
  let cwd = resolve(rawCwd);
  try {
    cwd = realpathSync(cwd);
  } catch { /* keep the resolved path */ }
  const config = loadConfig(cwd);
  if (!config.ledgerEnabled) return debug('ledger disabled');

  const toolName = payload.tool_name;
  const toolInput = payload.tool_input || {};
  const text = insertedTextOf(toolName, toolInput);
  const named = toolInput.file_path || toolInput.path;
  if (!text || !named) return debug('not a file insertion');

  let filePath = resolve(cwd, named);
  try {
    filePath = realpathSync(filePath);
  } catch {
    // Brand-new file: resolve the directory instead so a symlinked path still
    // lands inside the project rather than looking like an outside write.
    try {
      filePath = join(realpathSync(join(filePath, '..')), basename(filePath));
    } catch { /* keep the resolved path */ }
  }
  // Outside the project entirely — record the bare filename rather than a
  // `../../..` trail that would map out the student's disk.
  const rel = relative(cwd, filePath);
  const event = buildEvent({
    tool,
    model: payload.model,
    file: rel.startsWith('..') ? basename(filePath) : rel,
    text,
  });
  appendEvent(resolveLedgerPath(cwd), event);
  debug(`recorded ${event.event_id} ${event.file}`);

  if (!config.markersEnabled) return;
  const marked = rewriteIfUnchanged(filePath, (contents) => {
    if (!shouldMark({ toolName, text, file: event.file, contents, minLines: config.minLines, style: config.style })) {
      return null;
    }
    return injectMarker(contents, text, event, config.style);
  });
  debug(marked ? `marked ${event.file}` : 'marker guards not met');
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  try {
    const args = process.argv.slice(2);
    const toolFlag = args.indexOf('--tool');
    const tool = toolFlag !== -1 ? args[toolFlag + 1] : process.env.PROMPTCITE_TOOL;
    const raw = readStdin();
    if (!raw.trim()) return;
    const payload = JSON.parse(raw);
    if (payload.hook_event_name && payload.hook_event_name !== 'PostToolUse') {
      return debug(`ignoring ${payload.hook_event_name}`);
    }
    run(payload, { tool: tool || 'unknown', cwd: payload.cwd || process.cwd() });
  } catch (error) {
    debug(String(error));
  }
  // Always exit 0. A disclosure tool must never be the reason an edit fails.
}

/**
 * True when this file is the program being run rather than an imported module.
 * See the matching note in bin/verify.js: npm installs bins as symlinks, so
 * `process.argv[1]` is the link while `import.meta.url` is the real path, and a
 * direct comparison silently stops the CLI from running once installed.
 *
 * @param {string} metaUrl
 */
function invokedDirectly(metaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(metaUrl) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (invokedDirectly(import.meta.url)) main();
