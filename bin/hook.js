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
//   - Three events: PostToolUse, UserPromptSubmit, SessionStart (ADR 0010).
//     Nothing here can block, alter, or auto-approve a tool call or a prompt.
//     Rewriting tool input at PreToolUse would require emitting an "allow"
//     permission decision, which silently approves file writes the student
//     would otherwise be asked about. Not worth it for a comment. The two
//     added events only ever print context for the agent to read.
//   - Pointer, not copy. The ledger may hold the path of the agent's own
//     session transcript, never its content. The transcript already exists in
//     the agent's folder; we read it only when the student runs /receipt.
//   - Course context writes nothing. UserPromptSubmit prints the student's own
//     course file back to the agent and touches no file.
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
import { join, extname, relative, resolve, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listCourses, loadCourse, validateCourse } from './course.js';

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
 * @typedef {Object} SessionEvent
 * @property {string} schema_version
 * @property {string} event_id
 * @property {string} ts
 * @property {string} tool
 * @property {'session'} type
 * @property {string} session_id
 * @property {string} transcript_path
 *
 * @typedef {Object} HookPayload
 * @property {string} [hook_event_name]
 * @property {string} [session_id]
 * @property {string} [transcript_path]
 * @property {string} [prompt]
 * @property {string} [source]
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
 * `.jsx`, `.tsx`, and `.php` were in this table and are deliberately not any
 * more. All three are two languages in one file, and the comment token is only
 * a comment in one of them. A `//` line inside JSX children compiles to a
 * string and renders on the page; outside a `<?php` block it is printed to the
 * browser verbatim. Both were reproduced against a real transpiler and a real
 * `php` binary. A marker that appears in someone's submitted output is worse
 * than no marker at all, and there is no way to tell which half of the file an
 * insertion landed in without parsing it.
 *
 * @type {Record<string, string>}
 */
const LINE_COMMENT = {
  '.js': '//', '.mjs': '//', '.cjs': '//', '.ts': '//',
  '.java': '//', '.c': '//', '.h': '//', '.cpp': '//', '.hpp': '//', '.cc': '//',
  '.cs': '//', '.go': '//', '.rs': '//', '.swift': '//', '.kt': '//', '.kts': '//',
  '.scala': '//', '.dart': '//', '.zig': '//', '.groovy': '//', '.sol': '//',
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
  // The master switch, and it beats the instructor's policy on purpose.
  //
  // A student has to be able to stop their own machine recording, in the same
  // way they can uninstall. An instructor sets an expectation for an
  // assignment; they do not get a switch inside someone else's computer, and a
  // policy file that could force local recording back on would make this a
  // surveillance tool the first time somebody pointed it at a class. The
  // instructor's recourse is the receipt they are handed, which is the only
  // place it ever was.
  if (settings.enabled === false) {
    return { ledgerEnabled: false, markersEnabled: false, attest: false, ttlDays: DEFAULT_TTL_DAYS, minLines: DEFAULT_MIN_LINES, style: /** @type {MarkerStyle} */ ('line') };
  }
  // Attest mode changes what a marker says, not whether one is written — but it
  // has nothing to say without one, so asking for attestation asks for markers.
  // Not implying that made `require_attestation: true` a policy key that
  // silently did nothing, which is the worst kind of config.
  const attest = policy.require_attestation === true || markers.attest === true;
  return {
    ledgerEnabled: policy.require_ledger === true || ledger.enabled === true,
    markersEnabled: attest || policy.require_markers === true || markers.enabled === true,
    attest,
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
 * @param {LedgerEvent | SessionEvent} event
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

/**
 * Two markers, one shape. `@ai-assisted` is a provenance stamp and nothing more:
 * it states who wrote the block and stops. `@ai-unverified` is a claim the
 * student has not made yet, and `/receipt attest` is where they make it. The
 * difference matters because a stamp decorates code while a pending claim asks
 * for something, and only one of those gets a student to reread what the AI
 * handed them.
 *
 * Defaults to the stamp. Flipping every existing install to `@ai-unverified`
 * would retroactively mark already-submitted work as unfinished.
 *
 * @param {LedgerEvent} event
 * @param {boolean} [attest]
 */
export function markerText(event, attest = false) {
  const date = event.ts.slice(0, 10);
  const model = event.model ? ` ${event.model}` : '';
  const tag = attest ? '@ai-unverified' : '@ai-assisted';
  return `${tag} ${date}${model} via PromptCite (pc:${event.event_id})`;
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
  // Nothing goes above line 1. A marker there displaces whatever has to come
  // first: a `#!` line (which stops the script being executable at all — the
  // shell then tries to run Python as bash), an XML prolog, a YAML `---`. The
  // marker is optional and the first line is not, so the first line wins.
  if (first === 0) return false;
  if (insideStringLiteral(contents.slice(0, first))) return false;
  // Already marked from a previous pass. The `pc:` check above only catches a
  // marker that sits *inside* the replaced text, and a marker never does — it
  // sits on the line above it. Without this, editing one function with the AI
  // four times leaves four stacked markers over it.
  if (alreadyMarked(contents, first)) return false;
  return true;
}

/**
 * Whether the line directly above the insertion point is already a marker.
 *
 * @param {string} contents
 * @param {number} at offset the inserted text starts at, always a line start
 */
export function alreadyMarked(contents, at) {
  const lines = contents.slice(0, at).split('\n');
  const previous = lines[lines.length - 2];
  return previous !== undefined && previous.includes('via PromptCite');
}

/**
 * Whether the insertion point sits inside a multi-line string.
 *
 * Counting delimiters is not parsing and will not survive an escaped or nested
 * case, which is fine: it only has to be wrong in the safe direction. A marker
 * inside a Python docstring or a JS template literal silently becomes part of
 * that string's value, so a false "yes, inside" costs one missing marker while
 * a false "no" corrupts data the student is shipping.
 *
 * @param {string} before text preceding the insertion point
 */
export function insideStringLiteral(before) {
  const odd = (/** @type {string} */ token) => {
    let count = 0;
    let at = before.indexOf(token);
    while (at !== -1) {
      count += 1;
      at = before.indexOf(token, at + token.length);
    }
    return count % 2 === 1;
  };
  return odd('"""') || odd("'''") || odd('`');
}

/**
 * Insert the marker on its own line above `text`, matching its indentation.
 *
 * @param {string} contents
 * @param {string} text
 * @param {LedgerEvent} event
 * @param {MarkerStyle} style
 * @param {boolean} [attest]
 */
export function injectMarker(contents, text, event, style, attest = false) {
  const at = contents.indexOf(text);
  const indent = (text.match(/^[ \t]*/) || [''])[0];
  const body = markerText(event, attest);
  const comment = commentFor(event.file, style);
  if (!comment) return contents;
  // Match the file's own line ending. Dropping an LF line into a CRLF file
  // leaves mixed endings in the student's diff, which is noise they then have
  // to explain to whoever reviews it.
  const eol = contents.includes('\r\n') ? '\r\n' : '\n';
  const line = comment.kind === 'block'
    ? `${indent}/** ${body} */${eol}`
    : `${indent}${comment.token} ${body}${eol}`;
  return contents.slice(0, at) + line + contents.slice(at);
}

/** @param {string} message */
function debug(message) {
  if (process.env.PROMPTCITE_DEBUG === '1') process.stderr.write(`promptcite-hook: ${message}\n`);
}

/** @param {string} cwd */
function realCwd(cwd) {
  let real = resolve(cwd);
  try {
    real = realpathSync(real);
  } catch { /* keep the resolved path */ }
  return real;
}

/**
 * Parsed events of a ledger, skipping anything unparseable.
 *
 * @param {string} ledgerPath
 * @returns {Record<string, any>[]}
 */
function readLedger(ledgerPath) {
  try {
    if (!existsSync(ledgerPath)) return [];
    const out = [];
    for (const line of readFileSync(ledgerPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch { /* skip */ }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Add one `session` event per session_id per ledger: a pointer to the agent's
 * own transcript file. Never the transcript's content (ADR 0010). Does nothing
 * when the ledger is off or the payload carries no usable pointer.
 *
 * @param {HookPayload} payload
 * @param {string} cwd resolved working directory
 * @param {string} tool
 * @param {string} [home]
 * @returns {boolean} whether a new event was written
 */
export function recordSession(payload, cwd, tool, home = homedir()) {
  const config = loadConfig(cwd);
  if (!config.ledgerEnabled) return false;
  const { session_id: sessionId, transcript_path: transcript } = payload;
  if (typeof sessionId !== 'string' || !sessionId) return false;
  if (typeof transcript !== 'string' || !transcript || !isAbsolute(transcript)) return false;
  const ledgerPath = resolveLedgerPath(cwd, home);
  if (readLedger(ledgerPath).some((e) => e.type === 'session' && e.session_id === sessionId)) return false;
  appendEvent(ledgerPath, {
    schema_version: LEDGER_SCHEMA_VERSION,
    event_id: randomBytes(3).toString('hex').slice(0, 5),
    ts: new Date().toISOString(),
    tool,
    type: 'session',
    session_id: sessionId,
    transcript_path: transcript,
  });
  debug(`recorded session pointer ${sessionId}`);
  return true;
}

/**
 * Regex for a course name, id, or alias that ignores case, spaces, dashes and
 * underscores: "csce 423", "CSCE-423" and "csce423" all match "CSCE 423".
 * Letter and digit runs are the units, and the match must not sit inside a
 * longer word or number ("csce4230" does not match "csce 423").
 *
 * @param {string} candidate
 * @returns {RegExp | null}
 */
export function courseMatcher(candidate) {
  const parts = String(candidate).toLowerCase().match(/[a-z]+|[0-9]+/g);
  if (!parts || parts.join('').length < 3) return null; // too short to mean anything
  return new RegExp(`(?<![a-z0-9])${parts.join('[\\s_-]*')}(?![a-z0-9])`, 'i');
}

/** @param {any} course @param {string} prompt */
function mentions(course, prompt) {
  const names = [course.id, course.name, ...(Array.isArray(course.aliases) ? course.aliases : [])];
  return names.some((n) => {
    const re = typeof n === 'string' ? courseMatcher(n) : null;
    return re ? re.test(prompt) : false;
  });
}

const CONTEXT_CAP = 4096;
const QUOTE_CAP = 400;

/** @param {string} text @param {number} max */
function clip(text, max) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * The short note the agent sees. Each rule keeps its verbatim syllabus quote,
 * because a rule without its quote is a paraphrase, and a paraphrase is how
 * "ask first" turns into "allowed". Trimmed to CONTEXT_CAP by dropping rules
 * from the end and saying so.
 *
 * @param {any} course
 */
export function courseContext(course) {
  const head = `PromptCite course note: this work matches the student's course "${clip(course.name, 80)}". Its AI-use rules come from the course syllabus, saved by the student in a PromptCite course file. They are the instructor's words, not PromptCite's.`;
  const guidance = Array.isArray(course.guidance) ? course.guidance : [];
  const rules = guidance.map((/** @type {any} */ g) => `- ${clip(g.rule, 240)} (syllabus: "${clip(g.quote, QUOTE_CAP)}")`);
  const unclear = Array.isArray(course.unclear) ? course.unclear.map((/** @type {any} */ u) => clip(u.topic, 120)) : [];
  /** @type {string[]} */
  const tail = [];
  if (unclear.length) tail.push(`The syllabus is unclear on: ${unclear.join('; ')}.`);
  tail.push('Silence in the syllabus is not permission. Where it says nothing, the question is open and worth asking the instructor.');

  const build = (/** @type {number} */ n) => {
    const shown = rules.slice(0, n);
    const lines = [head];
    if (shown.length) lines.push('Rules:', ...shown);
    if (n < rules.length) lines.push(`(${rules.length - n} more rules are in the course file.)`);
    lines.push(...tail);
    return lines.join('\n');
  };
  let n = rules.length;
  let text = build(n);
  while (text.length > CONTEXT_CAP && n > 0) {
    n -= 1;
    text = build(n);
  }
  return text.length > CONTEXT_CAP ? text.slice(0, CONTEXT_CAP) : text;
}

/**
 * The first course the student has a file for that the prompt mentions, or the
 * course this folder is bound to. Invalid course files are skipped.
 *
 * @param {string} prompt
 * @param {string} cwd
 * @param {string} [home]
 */
export function findCourse(prompt, cwd, home = homedir()) {
  const bound = readJsonIfPresent(join(cwd, 'promptcite.config.json'))?.course;
  if (typeof bound === 'string') {
    const entry = loadCourse(bound, home);
    if (entry && entry.errors.length === 0) return entry.course;
  }
  for (const entry of listCourses(home)) {
    if (entry.errors.length) continue;
    if (!validateCourse(entry.course).errors.length && mentions(entry.course, prompt)) return entry.course;
  }
  return null;
}

/**
 * UserPromptSubmit: record the session pointer (ledger on) and return the
 * course note to print, or null. Writes nothing but the pointer.
 *
 * @param {HookPayload} payload
 * @param {{ tool?: string, cwd?: string, home?: string }} [options]
 * @returns {string | null}
 */
export function handleUserPrompt(payload, { tool = 'unknown', cwd: rawCwd = process.cwd(), home = homedir() } = {}) {
  const cwd = realCwd(rawCwd);
  recordSession(payload, cwd, tool, home);
  // Same master switch as recording: a student who turned PromptCite off gets
  // no output from it either.
  if (readJsonIfPresent(join(cwd, 'promptcite.config.json'))?.enabled === false) return null;
  const prompt = typeof payload.prompt === 'string' ? payload.prompt : '';
  const course = findCourse(prompt, cwd, home);
  if (!course) return null;
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: courseContext(course) },
  });
}

/**
 * SessionStart after a compaction, resume or clear: point the agent at the
 * earlier transcripts the ledger knows about for this folder.
 *
 * @param {HookPayload} payload
 * @param {{ cwd?: string, home?: string }} [options]
 * @returns {string | null}
 */
export function handleSessionStart(payload, { cwd: rawCwd = process.cwd(), home = homedir() } = {}) {
  const source = payload.source;
  if (source !== 'compact' && source !== 'resume' && source !== 'clear') return null;
  const cwd = realCwd(rawCwd);
  const config = loadConfig(cwd);
  if (!config.ledgerEnabled) return null;
  const lines = readLedger(resolveLedgerPath(cwd, home)).map((e) => JSON.stringify(e));
  const events = pruneExpired(lines, config.ttlDays).map((l) => JSON.parse(l));
  const paths = [...new Set(events.filter((e) => e.type === 'session' && typeof e.transcript_path === 'string').map((e) => e.transcript_path))].slice(-10);
  if (!paths.length) return null;
  const text = `PromptCite note: the student's PromptCite ledger lists ${paths.length} earlier agent session transcript${paths.length === 1 ? '' : 's'} for this folder (kept on this machine by the agent itself): ${paths.join(', ')}. After a ${source}, the earlier part of the work may no longer be in context, so a PromptCite /receipt run reads those files to reconstruct AI use across the whole assignment.`;
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } });
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

  recordSession(payload, cwd, tool);

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
    return injectMarker(contents, text, event, config.style, config.attest);
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
    const event = payload.hook_event_name;
    const options = { tool: tool || 'unknown', cwd: payload.cwd || process.cwd() };
    if (event === 'UserPromptSubmit') {
      const out = handleUserPrompt(payload, options);
      if (out) process.stdout.write(`${out}\n`);
    } else if (event === 'SessionStart') {
      const out = handleSessionStart(payload, options);
      if (out) process.stdout.write(`${out}\n`);
    } else if (!event || event === 'PostToolUse') {
      run(payload, options);
    } else {
      debug(`ignoring ${event}`);
    }
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
