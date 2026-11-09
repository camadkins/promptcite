#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins
//
// promptcite timeline: put an assignment's receipts and git commits (and, only
// when the student asks, their ledger notes) in date order, in one file the
// student can hand over after a detector flag. It's evidence of process, not
// a verdict: receipts are the student's own disclosures, git history can be
// rewritten before export, and the ledger misses anything typed by hand.
//
// Each entry carries the hash of the one before it, so editing the file after
// it's made breaks the chain. Nothing here anchors the chain to the outside
// world; the student does that by handing the head hash in with the work.
// See ADR 0015.
//
// Local only. Git is read with `git log` through execFile and an argument
// array. No network, no dependencies.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { canonicalize } from './verify.js';
import { resolveLedgerPath } from './hook.js';

export const TIMELINE_VERSION = '1.0';

export const NOTE = 'Evidence of process, compiled by the student. Receipts are the student\'s own disclosures, git history can be changed before export, and ledger notes (when included) miss anything typed by hand. The hash chain shows this file has not been edited since it was made, not when it was made or that it is complete.';

const LEDGER_NOTE = 'AI insertion note from the local ledger, incomplete by design';

/** @param {unknown} value */
const sha256 = (value) => createHash('sha256').update(canonicalize(value)).digest('hex');

/**
 * @typedef {{ at: string, kind: 'receipt_session' | 'commit' | 'ledger', [k: string]: unknown }} Entry
 */

/**
 * Receipt JSON files named ai-receipt*.json in a folder, in name order.
 * @param {string} dir
 */
export function findReceipts(dir) {
  return readdirSync(dir)
    .filter((f) => /^ai-receipt.*\.json$/.test(f))
    .sort()
    .map((f) => join(dir, f));
}

/**
 * One entry per session in each receipt. Only what the student disclosed, plus
 * the receipt's own hash so a reader can match the entry to the receipt.
 * @param {{ file: string, receipt: any }[]} receipts
 * @returns {Entry[]}
 */
export function receiptEntries(receipts) {
  /** @type {Entry[]} */
  const out = [];
  for (const { file, receipt } of receipts) {
    const sessions = Array.isArray(receipt.ai_use) ? receipt.ai_use : [receipt.ai_use];
    sessions.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
      /** @type {Entry} */
      const e = { at: String(s.date), kind: 'receipt_session', receipt: basename(file), session: i, tool: s.tool, model: s.model, category: s.category, prompt_summary: s.prompt_summary };
      if (s.appendix && typeof s.appendix.share_link_or_excerpt === 'string' && /^https?:\/\//.test(s.appendix.share_link_or_excerpt)) {
        e.share_link = s.appendix.share_link_or_excerpt;
      }
      out.push(e);
    });
  }
  return out;
}

/**
 * Commits that touched this folder, oldest first. Hash, date, subject and line
 * counts only: no diffs, no author email.
 * @param {string} cwd
 * @param {{ since?: string | null }} [opts]
 * @returns {{ entries: Entry[], skipped: string | null }}
 */
export function gitEntries(cwd, { since = null } = {}) {
  // --no-ext-diff and --no-textconv: --numstat runs a diff, and git config can
  // attach commands to diffs. Reading history must never run one.
  const args = ['-C', cwd, 'log', '--reverse', '--no-color', '--no-ext-diff', '--no-textconv', '--format=%x1e%H%x1f%aI%x1f%s', '--numstat'];
  if (since) args.push(`--since=${since}`);
  args.push('--', '.');
  let out;
  try {
    out = execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (/** @type {any} */ err) {
    if (err && err.code === 'ENOENT') return { entries: [], skipped: 'git is not installed' };
    return { entries: [], skipped: 'this folder is not in a git repository (or it has no commits yet)' };
  }
  /** @type {Entry[]} */
  const entries = [];
  for (const block of out.split('\x1e').slice(1)) {
    const [head, ...rest] = block.split('\n');
    const [sha = '', at = '', subject = ''] = (head ?? '').split('\x1f');
    let files = 0;
    let insertions = 0;
    let deletions = 0;
    for (const line of rest) {
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
      if (!m) continue;
      files += 1;
      if (m[1] !== '-') insertions += Number(m[1]);
      if (m[2] !== '-') deletions += Number(m[2]);
    }
    entries.push({ at, kind: 'commit', sha, subject, files_changed: files, insertions, deletions });
  }
  return { entries, skipped: null };
}

/**
 * Ledger events for this folder, read only. Unparseable lines are skipped, as
 * the ledger schema requires.
 * @param {string} cwd
 * @param {{ home?: string, since?: string | null }} [opts]
 * @returns {Entry[]}
 */
export function ledgerEntries(cwd, { home = homedir(), since = null } = {}) {
  const path = resolveLedgerPath(cwd, home);
  if (!existsSync(path)) return [];
  const floor = since ? Date.parse(since) : -Infinity;
  /** @type {Entry[]} */
  const out = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || typeof ev.ts !== 'string' || Date.parse(ev.ts) < floor) continue;
    /** @type {Entry} */
    const e = { at: ev.ts, kind: 'ledger', event_id: ev.event_id, tool: ev.tool, file: ev.file, lines_added: ev.lines_added, note: LEDGER_NOTE };
    if (ev.model) e.model = ev.model;
    out.push(e);
  }
  return out;
}

/**
 * Sort entries by time and chain them. The first entry's `prev` is the hash of
 * the header, so the header can't be swapped either.
 * @param {{ generatedAt: string, assignment: any, student: string | null, sources: any, entries: Entry[] }} args
 */
export function buildTimeline({ generatedAt, assignment, student, sources, entries }) {
  const header = { timeline_version: TIMELINE_VERSION, generated_at: generatedAt, note: NOTE, student, assignment, sources };
  const sorted = entries
    .map((e, i) => ({ e, i, t: Date.parse(e.at) }))
    .sort((a, b) => (a.t - b.t) || (a.i - b.i))
    .map(({ e }) => e);
  let prev = sha256(header);
  const chained = sorted.map((e, seq) => {
    const body = { seq, ...e, prev };
    const hash = sha256(body);
    prev = hash;
    return { ...body, hash };
  });
  return { ...header, header_hash: sha256(header), entries: chained, head: prev };
}

/**
 * Re-walk the chain. Returns null when it holds, or what broke and where.
 * @param {any} t
 * @returns {string | null}
 */
export function checkTimeline(t) {
  if (!t || typeof t !== 'object' || !Array.isArray(t.entries)) return 'not a timeline file';
  const header = { timeline_version: t.timeline_version, generated_at: t.generated_at, note: t.note, student: t.student, assignment: t.assignment, sources: t.sources };
  let prev = sha256(header);
  if (t.header_hash !== prev) return 'the header was changed';
  for (let i = 0; i < t.entries.length; i++) {
    const { hash, ...body } = t.entries[i];
    if (body.seq !== i) return `entry ${i} is out of place (entries were added, removed, or reordered)`;
    if (body.prev !== prev) return `entry ${i} doesn't follow entry ${i - 1}`;
    if (sha256(body) !== hash) return `entry ${i} was changed`;
    prev = hash;
  }
  if (t.head !== prev) return 'the head hash doesn\'t match the last entry';
  return null;
}

/** @param {string} at */
const day = (at) => String(at).slice(0, 10);

/**
 * The readable copy. The JSON is the one that verifies.
 * @param {ReturnType<typeof buildTimeline>} t
 * @param {string} jsonName
 */
export function renderMarkdown(t, jsonName) {
  const a = t.assignment ?? {};
  const title = [a.course, a.title].filter(Boolean).join(', ') || 'this assignment';
  const lines = [
    `# Process timeline: ${title}`,
    '',
    t.student ? `Compiled by ${t.student} on ${day(t.generated_at)}.` : `Compiled on ${day(t.generated_at)}.`,
    '',
    `> ${t.note}`,
    '',
    '| When | What | Detail |',
    '|---|---|---|',
  ];
  const cell = (/** @type {unknown} */ s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  for (const entry of t.entries) {
    const e = /** @type {any} */ (entry);
    if (e.kind === 'commit') {
      lines.push(`| ${day(e.at)} | commit \`${String(e.sha).slice(0, 7)}\` | ${cell(e.subject)} (${e.files_changed} ${e.files_changed === 1 ? 'file' : 'files'}, +${e.insertions} / -${e.deletions}) |`);
    } else if (e.kind === 'receipt_session') {
      lines.push(`| ${day(e.at)} | disclosed AI use (${cell(e.category)}) | ${cell(e.tool)} (${cell(e.model)}): ${cell(e.prompt_summary)}${e.share_link ? `, ${cell(e.share_link)}` : ''} |`);
    } else {
      lines.push(`| ${day(e.at)} | ledger note | ${cell(e.tool)} inserted ${e.lines_added} lines into \`${cell(e.file)}\`, incomplete by design |`);
    }
  }
  if (t.entries.length === 0) lines.push('| | nothing found | |');
  lines.push('', `Sources: ${t.sources.receipts.length ? t.sources.receipts.join(', ') : 'no receipts'}; git ${t.sources.git ? 'history' : `not read (${t.sources.git_skipped})`}; ledger ${t.sources.ledger ? 'included at the student\'s request' : 'not included'}.`);
  lines.push('', `Head hash: \`${t.head}\``, '', `Check it with \`promptcite timeline verify ${jsonName}\`. If the head hash was handed in with the work, a matching one later shows the file is the same one.`, '');
  return lines.join('\n');
}

/**
 * `name.ext`, or `name-2.ext`, `name-3.ext` ... whichever is free. Never overwrite.
 * @param {string} dir
 * @param {string} base
 */
export function freeBase(dir, base) {
  for (let n = 1; ; n++) {
    const b = n === 1 ? base : `${base}-${n}`;
    if (!existsSync(join(dir, `${b}.json`)) && !existsSync(join(dir, `${b}.md`))) return b;
  }
}

const HELP = `promptcite timeline: put this assignment's receipts and git commits in date order, hash-chained

USAGE
  promptcite timeline [--receipt <file>]... [--since <date>] [--with-ledger] [--yes]
  promptcite timeline verify <file.json>

  --receipt <file>   a receipt to include (repeatable). Default: ai-receipt*.json here
  --since <date>     only commits and ledger notes from this date on (YYYY-MM-DD)
  --with-ledger      also include your local ledger notes. You see them first
  --yes              include them without asking (for scripts)

Writes promptcite-timeline.json and .md here, never over an existing file.
It's evidence of process, not a verdict. See ADR 0015.

EXIT CODES
  0  written, or the chain holds
  1  user error, or the chain is broken
  2  internal error`;

/**
 * @param {string[]} argv
 * @param {{ cwd?: string, home?: string, now?: Date, log?: (m: string) => void, err?: (m: string) => void, confirm?: (q: string) => Promise<boolean> }} [io]
 * @returns {Promise<number>}
 */
export async function runTimeline(argv, io = {}) {
  const cwd = io.cwd ?? process.cwd();
  const log = io.log ?? ((m) => console.log(m));
  const err = io.err ?? ((m) => console.error(m));
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        receipt: { type: 'string', multiple: true },
        since: { type: 'string' },
        'with-ledger': { type: 'boolean' },
        yes: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (/** @type {any} */ e) {
    err(`error: ${e.message}`);
    return 1;
  }
  const { values, positionals } = parsed;
  if (values.help) { log(HELP); return 0; }

  if (positionals[0] === 'verify') {
    if (positionals.length !== 2) { err('error: give one timeline file: promptcite timeline verify <file.json>'); return 1; }
    const target = String(positionals[1]);
    let t;
    try { t = JSON.parse(readFileSync(resolve(cwd, target), 'utf8')); } catch (/** @type {any} */ e) {
      err(`error: can't read ${target}: ${e.message}`);
      return 1;
    }
    const broken = checkTimeline(t);
    if (broken) { log(`BROKEN  ${target}: ${broken}`); return 1; }
    log(`INTACT  ${target} (head ${String(t.head).slice(0, 12)}…, unchanged since it was made)`);
    return 0;
  }
  if (positionals.length) { err(`error: unknown timeline command "${positionals[0]}". Expected verify, or nothing.`); return 1; }
  if (values.since && !/^\d{4}-\d{2}-\d{2}$/.test(values.since)) { err('error: --since takes a date like 2026-11-01'); return 1; }

  const files = values.receipt?.length ? values.receipt.map((f) => resolve(cwd, f)) : findReceipts(cwd);
  /** @type {{ file: string, receipt: any }[]} */
  const receipts = [];
  for (const file of files) {
    try { receipts.push({ file, receipt: JSON.parse(readFileSync(file, 'utf8')) }); } catch (/** @type {any} */ e) {
      err(`error: can't read receipt ${basename(file)}: ${e.message}`);
      return 1;
    }
  }
  const titles = [...new Set(receipts.map((r) => JSON.stringify([r.receipt.assignment?.course ?? null, r.receipt.assignment?.title ?? null])))];
  if (titles.length > 1) {
    err('error: these receipts are for different assignments. Pick one assignment\'s receipts with --receipt:');
    for (const r of receipts) err(`  ${basename(r.file)}: ${[r.receipt.assignment?.course, r.receipt.assignment?.title].filter(Boolean).join(', ')}`);
    return 1;
  }
  const first = receipts[0]?.receipt;
  const assignment = first?.assignment ? { course: first.assignment.course ?? null, title: first.assignment.title ?? null } : null;

  const git = gitEntries(cwd, { since: values.since ?? null });
  let ledger = /** @type {Entry[]} */ ([]);
  if (values['with-ledger']) {
    ledger = ledgerEntries(cwd, { home: io.home ?? homedir(), since: values.since ?? null });
    if (ledger.length === 0) {
      log('ledger: nothing recorded for this folder (it may have been cleared when a receipt was written).');
    } else {
      log('These ledger notes would go into the timeline. They are your private notes, and they miss anything you typed yourself:');
      for (const e of ledger) log(`  ${day(e.at)}  ${e.tool} inserted ${e.lines_added} lines into ${e.file}`);
      const ok = values.yes === true || await (io.confirm ?? askYes)('Include them? [y/N] ');
      if (!ok) { log('Leaving the ledger out.'); ledger = []; }
    }
  }

  const timeline = buildTimeline({
    generatedAt: (io.now ?? new Date()).toISOString(),
    assignment,
    student: typeof first?.student === 'string' ? first.student : null,
    sources: { receipts: receipts.map((r) => basename(r.file)), git: git.skipped === null, git_skipped: git.skipped, ledger: ledger.length > 0 },
    entries: [...receiptEntries(receipts), ...git.entries, ...ledger],
  });
  const base = freeBase(cwd, 'promptcite-timeline');
  writeFileSync(join(cwd, `${base}.json`), `${JSON.stringify(timeline, null, 2)}\n`);
  writeFileSync(join(cwd, `${base}.md`), renderMarkdown(timeline, `${base}.json`));
  if (git.skipped) log(`git: skipped, ${git.skipped}.`);
  if (receipts.length === 0) log('receipts: none found here (pass --receipt <file> to add one).');
  log(`wrote ${base}.json and ${base}.md`);
  log(`head hash: ${timeline.head}`);
  log('Hand the head hash in with your work if you want a later copy to be checkable against it.');
  return 0;
}

/** @param {string} q */
async function askYes(q) {
  if (!process.stdin.isTTY) {
    console.error('Not asking without a terminal. Pass --yes to include the ledger notes.');
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return /^y(es)?$/i.test((await rl.question(q)).trim()); } finally { rl.close(); }
}

/** @param {string} metaUrl */
function invokedDirectly(metaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fileURLToPath(metaUrl) === realpathSync(entry);
  } catch {
    return false;
  }
}

if (invokedDirectly(import.meta.url)) {
  try {
    process.exit(await runTimeline(process.argv.slice(2)));
  } catch (/** @type {any} */ e) {
    console.error(`error: ${e?.message ?? e}`);
    process.exit(2);
  }
}
