#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins
//
// `promptcite-check` — lists the AI-written blocks in this project that nobody
// has said they read yet, and exits non-zero while any remain.
//
//   promptcite-check            # walk the current directory
//   promptcite-check src        # walk one subtree
//
// This is a gate a student runs on themselves before submitting, in the same
// spirit as a linter. It is not a detector and it cannot be made into one.
// What it finds is `@ai-unverified` markers, which the hook writes only for
// insertions of `markers.min_lines` or more, made by an Edit, in a file type
// whose comment syntax PromptCite knows. Plenty of AI-assisted code will never
// carry one, so a clean run means "no pending markers", never "no AI here".
// Anyone reading it the second way is reading it wrong — see
// docs/for-instructors.md.
//
// Zero dependencies, no network, reads files and writes nothing.

import {
  readdirSync, readFileSync, realpathSync,
  openSync, closeSync, fstatSync,
} from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { insideStringLiteral } from './hook.js';

/**
 * The one tag that means a question is still open.
 *
 * Its settled counterparts need no handling here and are listed only so the
 * vocabulary is in one place: `@ai-verified` is "I checked it", `@ai-disputed`
 * is "the AI didn't write this", and `@ai-assisted` is the plain provenance
 * stamp from installs that never turned attestation on. All three are answers,
 * so none of them is an open question and none of them matches below.
 */
const PENDING = '@ai-unverified';

/**
 * The full marker shape, not just the tag.
 *
 * Matching the bare tag looked fine until this file matched itself: any project
 * that documents PromptCite mentions `@ai-unverified` in prose, and a gate that
 * flags its own README is a gate people turn off. The hook always writes
 * the vendor string on the same line, so requiring it costs nothing and drops
 * every mention that isn't an actual marker.
 *
 * Assembled from parts rather than written as one literal, because a literal
 * holding both halves is itself a line this regex matches. The gate flagging
 * its own source is the same bug one level down.
 */
const VENDOR = 'via PromptCite';

/**
 * A marker is a comment, and the tag has to be the first thing in it.
 *
 * Without the leading comment token this matched a student's own source: a
 * parser with `PATTERN = "@ai-unverified ... via PromptCite"` in it got flagged
 * as unverified code. Requiring the line to open with a comment token drops
 * that whole class, since a string assignment has an identifier and an `=`
 * ahead of the quote.
 *
 * The token list is the union of what the hook can write. Kept as one
 * character class rather than a per-language map because check only has to
 * recognize a marker, not know which language it's in.
 */
const COMMENT_OPEN = String.raw`(?://|\#|--|;|/\*\*?)`;
const MARKER = new RegExp(`^\\s*${COMMENT_OPEN}\\s*${PENDING}\\b[^\\n]*${VENDOR}`);

/**
 * Directories that are never the student's own work. Walking them is slow and
 * anything found inside is somebody else's code, which this tool has no
 * business reporting on.
 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache',
  'vendor', 'coverage', '.cache', '.gradle', '.idea', '.vscode', 'obj',
]);

/**
 * Source files, which is deliberately a wider net than the hook writes into.
 *
 * Scanning *everything* found markers in prose — a README explaining the tool,
 * a fenced block in someone's writeup — and reporting those as unfinished work
 * is wrong twice over: nothing put them there and the student cannot clear
 * them. So the scan is scoped. But it is scoped to source files, not to the
 * hook's write table, and the difference matters: `.jsx`, `.tsx`, `.php`,
 * `.vue`, and `.svelte` are files the hook refuses to write to (the comment
 * token is only a comment in half the file) while still being files a student
 * can end up with a marker in, by pasting code a browser chatbot handed them.
 *
 * Reading is not writing. Refusing to put a marker somewhere is no reason to
 * refuse to see one that is already there.
 */
const MARKABLE = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.java', '.c', '.h', '.cpp', '.hpp', '.cc',
  '.cs', '.go', '.rs', '.swift', '.kt', '.kts', '.scala', '.dart', '.zig',
  '.groovy', '.sol', '.py', '.rb', '.sh', '.bash', '.zsh', '.pl', '.r', '.jl',
  '.ex', '.exs', '.nim', '.cr', '.sql', '.hs', '.lua', '.elm', '.clj', '.cljs',
  '.el', '.scm', '.lisp',
  // Written by hand or pasted in, never by the hook. See the note above.
  '.jsx', '.tsx', '.php', '.vue', '.svelte',
]);

/** Big files are generated files. A marker lives in something a person edits. */
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Read one directory. A failure on the starting path is fatal; a failure
 * anywhere below it is not.
 *
 * That distinction is the whole error contract. A student who typos the path
 * should be told so, and `readdirSync` throwing is how we find out. A directory
 * inside the tree we happen not to have permission for is not their problem, and
 * must not turn into either "your submission is fine" or "your path is wrong".
 *
 * @param {string} dir
 * @param {boolean} required
 * @returns {import('node:fs').Dirent[]}
 */
function entriesOf(dir, required) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (required) throw error;
    return [];
  }
}

/** How far into a file to look for the NUL byte that gives away a binary. */
const SNIFF_BYTES = 8192;

/**
 * Collect every file worth reading under `root`.
 *
 * Symlinks are skipped rather than followed. A link can point anywhere,
 * including back into the tree, and a submission gate that hangs on a cycle or
 * wanders off into someone's home directory is worse than one that misses a
 * file.
 *
 * The root is read rather than checked first. Asking whether a path is a
 * directory and then reading it is two operations on something that can change
 * in between, which is a race this repo has already been bitten by once in the
 * hook. Reading it IS the check: if it isn't there, or isn't a directory, the
 * read throws and the caller turns that into an exit code.
 *
 * @param {string} root
 * @param {{ all?: boolean }} [options]
 * @returns {string[]}
 */
export function walk(root, { all = false } = {}) {
  /** @type {string[]} */
  const found = [];
  /** @type {{ dir: string, required: boolean }[]} */
  const queue = [{ dir: root, required: true }];
  while (queue.length) {
    const { dir, required } = /** @type {{ dir: string, required: boolean }} */ (queue.pop());
    for (const entry of entriesOf(dir, required)) {
      if (entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (all || !SKIP_DIRS.has(entry.name)) queue.push({ dir: full, required: false });
      } else if (entry.isFile() && MARKABLE.has(extname(entry.name).toLowerCase())) {
        found.push(full);
      }
    }
  }
  return found.sort();
}

/**
 * Line numbers of every pending marker in `contents`, 1-indexed.
 *
 * @param {string} contents
 * @returns {number[]}
 */
export function pendingLines(contents) {
  /** @type {number[]} */
  const hits = [];
  const lines = contents.split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === undefined) break;
    // A tag inside a docstring or a template literal reads like a marker and is
    // not one — it's string data. The attest flow is told to leave those alone,
    // so listing them here would hand the student a gate they cannot clear.
    // Same predicate the hook uses to decide where it refuses to write.
    if (MARKER.test(line) && !insideStringLiteral(contents.slice(0, offset))) {
      hits.push(i + 1);
    }
    offset += line.length + 1;
  }
  return hits;
}

/**
 * Read a file as text, or return null if it isn't one.
 *
 * The size check and the read go through **one descriptor**, the same pattern
 * `rewriteIfUnchanged` uses in bin/hook.js. Stat-the-path-then-read-the-path is
 * two operations on something that can change in between, and the size cap
 * exists precisely to avoid pulling a huge file into memory, so a check that
 * can be invalidated before the read does not actually buy the protection it
 * looks like it buys.
 *
 * The binary sniff is a NUL byte in the first few kilobytes, checked on the raw
 * buffer rather than a decoded string, because decoding a binary as UTF-8
 * succeeds and produces replacement characters instead of failing.
 *
 * @param {string} file
 * @returns {string | null}
 */
function readTextFile(file) {
  /** @type {number | undefined} */
  let fd;
  try {
    fd = openSync(file, 'r');
    if (fstatSync(fd).size > MAX_BYTES) return null;
    const buffer = readFileSync(fd);
    if (buffer.subarray(0, SNIFF_BYTES).indexOf(0) !== -1) return null;
    return buffer.toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch { /* already closed */ }
  }
}

/**
 * @param {string} root
 * @param {{ all?: boolean }} [options]
 * @returns {{ hits: { file: string, line: number }[], skipped: string[] }}
 */
export function scan(root, { all = false } = {}) {
  /** @type {{ file: string, line: number }[]} */
  const hits = [];
  /** @type {string[]} */
  const skipped = [];
  for (const file of walk(root, { all })) {
    const contents = readTextFile(file);
    if (contents === null || !contents.includes(PENDING)) continue;
    const lines = pendingLines(contents);
    const name = relative(root, file) || file;
    for (const line of lines) hits.push({ file: name, line });
    // The tag is in this file but nothing in it is attestable — it is inside a
    // string, or it never opened a comment. Named rather than hidden, because
    // the attest flow is supposed to be able to mention these without going
    // looking for them, and looking is the thing it must not do.
    if (lines.length === 0) skipped.push(name);
  }
  return { hits, skipped };
}

function printHelp() {
  console.log(`promptcite-check — find AI-written blocks you haven't verified yet

Usage:
  promptcite-check [path]

Walks the directory (default: the current one) and lists every ${PENDING}
marker still waiting on you. Clear them with /receipt attest in your agent,
which asks what you checked and writes your answer into the file.

Options:
  -a, --all     also walk build and dependency directories, which are
                skipped by default: ${[...SKIP_DIRS].slice(0, 6).join(', ')}, and others
  -q, --quiet   report through the exit code alone

Exit codes:
  0  nothing pending
  1  at least one marker is still unverified
  3  the path you gave doesn't exist

A clean run means no pending markers. It does not mean no AI was used here,
and it is not evidence of anything to anyone else.`);
}

/**
 * @param {string[]} argv
 * @returns {number}
 */
export function runCheck(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    return 0;
  }
  const quiet = argv.includes('-q') || argv.includes('--quiet');
  const all = argv.includes('-a') || argv.includes('--all');
  const args = argv.filter((/** @type {string} */ a) => !a.startsWith('-'));
  const root = resolve(args[0] || process.cwd());

  /** @type {{ hits: { file: string, line: number }[], skipped: string[] }} */
  let result;
  try {
    result = scan(root, { all });
  } catch {
    // Missing, not a directory, or unreadable. One operation, one answer, and
    // no window between deciding the path is fine and acting on it.
    console.error(`error: cannot read ${root}`);
    return 3;
  }
  const { hits, skipped } = result;
  const note = () => {
    if (quiet || skipped.length === 0) return;
    console.log('');
    console.log('note: the tag also appears in these, inside a string or outside a comment.');
    console.log('Those are not markers and there is nothing in them to clear:');
    for (const name of skipped) console.log(`  ${name}`);
  };
  if (hits.length === 0) {
    if (!quiet) console.log('No pending markers. Everything the hook flagged has been verified.');
    note();
    return 0;
  }
  if (!quiet) {
    for (const hit of hits) console.log(`${hit.file}:${hit.line}`);
    console.log('');
    console.log('Still unverified. Run /receipt attest in your agent to close these out,');
    console.log('or write the verification into the marker yourself if you would rather.');
    note();
  }
  return 1;
}

/**
 * True when this file is the program being run rather than an imported module.
 * npm installs bins as symlinks, so `process.argv[1]` is the link while
 * `import.meta.url` is the real path; see the matching note in bin/verify.js.
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

if (invokedDirectly(import.meta.url)) process.exit(runCheck(process.argv.slice(2)));
