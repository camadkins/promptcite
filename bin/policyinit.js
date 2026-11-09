// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins
//
// promptcite policy init: for instructors. Pick an AI level on the AIAS, or a
// lane on the two-lane model, paste the rule as written, and get a
// promptcite.policy.json for the assignment folder. The file is checked with
// the same validator /receipt uses before anything is written.
//
// The rule text is required and kept word for word. A level with no words
// behind it is a paraphrase nobody can check (ADR 0011).
//
// Local only: reads and writes promptcite.policy.json in the current folder.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { AIAS, CATEGORIES, describeLevel } from './level.js';
import { validatePolicy } from './course.js';

/**
 * The two-lane model (University of Sydney): Lane 1 is secured assessment,
 * where AI use is controlled; Lane 2 is open, where AI may be used. Lane 1
 * isn't automatically "no AI", so the instructor says what it allows.
 * Written into the policy as a custom scale, so nothing downstream needs to
 * know about lanes.
 *
 * @param {string[]} lane1Allows
 */
export function laneScale(lane1Allows) {
  return {
    name: 'Two-lane assessment',
    levels: [
      { level: 1, label: 'Lane 1 (secure)', allows: lane1Allows },
      { level: 2, label: 'Lane 2 (open)', allows: [...CATEGORIES] },
    ],
  };
}

/**
 * The ai_level for a choice. Throws on anything the validator would reject,
 * with a message an instructor can act on.
 *
 * @param {{ scale: 'aias' | 'lanes', level: number, quote: string, where?: string | null, allows?: string[] | null }} choice
 */
export function buildAiLevel({ scale, level, quote, where = null, allows = null }) {
  if (!quote || !quote.trim()) throw new Error('paste the rule as it\'s written in your syllabus or assignment sheet; it can\'t be empty');
  /** @type {Record<string, unknown>} */
  const ai = {};
  if (scale === 'aias') {
    if (!AIAS.levels.some((l) => l.level === level)) throw new Error('an AIAS level is 1 to 5');
    ai.level = level;
  } else if (scale === 'lanes') {
    if (level !== 1 && level !== 2) throw new Error('a lane is 1 or 2');
    if (level === 1 && allows === null) throw new Error('lane 1 needs the uses it allows (--allows brainstorm,explain, or --allows none)');
    const bad = (allows ?? []).filter((c) => !CATEGORIES.includes(c));
    if (bad.length) throw new Error(`not a use category: ${bad.join(', ')}. Expected ${CATEGORIES.join(', ')}`);
    ai.scale = laneScale(level === 1 ? /** @type {string[]} */ (allows) : []);
    ai.level = level;
  } else {
    throw new Error('the scale is aias or lanes');
  }
  ai.quote = quote.trim();
  if (where && where.trim()) ai.where = where.trim();
  return ai;
}

/** @param {string | undefined} raw */
function parseAllows(raw) {
  if (raw === undefined) return null;
  // Empty is not "none": lane 1 isn't automatically no AI, so say which.
  if (!raw.trim()) throw new Error('say which uses lane 1 allows, comma-separated, or "none"');
  if (raw.trim().toLowerCase() === 'none') return [];
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

const HELP = `promptcite policy init: write this assignment's promptcite.policy.json

USAGE
  promptcite policy init                          asks you each question
  promptcite policy init --scale aias --level 2 --quote "<rule as written>" [--where "<doc>"] [--reflection] --yes
  promptcite policy init --scale lanes --level 1 --allows brainstorm,explain --quote "..." --yes

  --scale aias|lanes   the AI Assessment Scale (levels 1 to 5) or the two-lane model
  --level <n>          AIAS 1 to 5, or lane 1 or 2
  --allows <uses>      lane 1 only: the uses it allows, comma-separated, or "none"
  --quote <text>       the rule word for word, as students will see it quoted
  --where <text>       where the rule is written, e.g. "Assignment 3 sheet"
  --reflection         also turn on the four reflection questions
  --force              replace an ai_level the file already has
  --yes                write without asking (needed when there's no terminal)

Run it in the assignment folder students will work in. Other keys already in
the file are kept. Check the result with: promptcite policy check`;

/**
 * @param {string[]} argv  Everything after "policy init".
 * @param {{ cwd?: string, log?: (m: string) => void, err?: (m: string) => void, ask?: (q: string) => Promise<string>, tty?: boolean }} [io]
 * @returns {Promise<number>}
 */
export async function runPolicyInit(argv, io = {}) {
  const cwd = io.cwd ?? process.cwd();
  const log = io.log ?? ((m) => console.log(m));
  const err = io.err ?? ((m) => console.error(m));
  const tty = io.tty ?? Boolean(process.stdin.isTTY);
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        scale: { type: 'string' },
        level: { type: 'string' },
        allows: { type: 'string' },
        quote: { type: 'string' },
        where: { type: 'string' },
        reflection: { type: 'boolean' },
        force: { type: 'boolean' },
        yes: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (/** @type {any} */ e) {
    err(`error: ${e.message}`);
    return 1;
  }
  if (values.help) { log(HELP); return 0; }

  const file = join(cwd, 'promptcite.policy.json');
  /** @type {Record<string, unknown>} */
  let existing = {};
  const existed = existsSync(file);
  if (existed) {
    try {
      existing = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      err(`error: ${file} isn't valid JSON. Fix or move it first; nothing was written.`);
      return 1;
    }
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      err(`error: ${file} isn't a JSON object. Nothing was written.`);
      return 1;
    }
    if (existing.ai_level !== undefined && !values.force) {
      err('error: this folder\'s promptcite.policy.json already has an ai_level. Pass --force to replace it.');
      return 1;
    }
  }

  // Ask for whatever the flags didn't give. No terminal and something missing
  // means stop, never guess.
  const ask = io.ask ?? (tty ? askLine : null);
  /** @param {string} q */
  const need = async (q) => {
    if (!ask) throw new Error(`missing an answer and there's no terminal to ask: ${q.trim()}`);
    return (await ask(q)).trim();
  };

  let choice;
  let reflection = values.reflection === true;
  try {
    const scaleRaw = values.scale ?? (values.level === undefined && ask ? (await need('Scale: AIAS levels 1 to 5, or the two-lane model? [aias/lanes] (aias) ')) || 'aias' : 'aias');
    const scale = scaleRaw.toLowerCase() === 'lanes' || scaleRaw.toLowerCase() === 'lane' ? 'lanes' : scaleRaw.toLowerCase() === 'aias' ? 'aias' : null;
    if (!scale) throw new Error('the scale is aias or lanes');
    if (values.level === undefined && ask) {
      if (scale === 'aias') for (const l of AIAS.levels) log(`  ${l.level}  ${l.label}`);
      else log('  1  Lane 1 (secure): AI use is controlled, and you say what it allows\n  2  Lane 2 (open): AI may be used');
    }
    const levelRaw = values.level ?? await need(scale === 'aias' ? 'Level (1-5): ' : 'Lane (1 or 2): ');
    const level = Number(levelRaw);
    let allows = parseAllows(values.allows);
    if (scale === 'lanes' && level === 1 && allows === null) {
      allows = parseAllows(await need(`Which uses does lane 1 allow? (${CATEGORIES.join(', ')}, or "none"): `));
    }
    const quote = values.quote ?? await need('Paste the rule as written (students see it quoted word for word): ');
    const where = values.where ?? (ask && values.quote === undefined ? await need('Where is it written? (optional, e.g. "Assignment 3 sheet"): ') : null);
    if (values.reflection === undefined && ask && values.quote === undefined) {
      reflection = /^y(es)?$/i.test(await need('Ask students the four reflection questions too? [y/N] '));
    }
    choice = buildAiLevel({ scale, level, quote, where, allows });
  } catch (/** @type {any} */ e) {
    err(`error: ${e.message}`);
    return 1;
  }

  /** @type {Record<string, unknown>} */
  const policy = { ...existing, ai_level: choice };
  if (reflection) policy.reflection = true;
  const { errors } = validatePolicy(policy);
  if (errors.length) {
    err('error: the policy wouldn\'t be valid, so nothing was written:');
    for (const e of errors) err(`  ${e}`);
    return 1;
  }

  const text = `${JSON.stringify(policy, null, 2)}\n`;
  log('');
  log(text.trimEnd());
  log('');
  log(`level: ${describeLevel(choice)}`);
  if (!values.yes) {
    if (!ask) { err('Not writing without a terminal to confirm. Pass --yes.'); return 1; }
    if (!/^y(es)?$/i.test(await need(`Write ${existed ? 'the updated' : 'this'} promptcite.policy.json here? [y/N] `))) {
      log('Nothing written.');
      return 0;
    }
  }
  // A new file is created exclusively, so one that appeared after the check (or
  // a planted symlink) is never written through. An existing one is the merge.
  try {
    writeFileSync(file, text, { flag: existed ? 'w' : 'wx' });
  } catch (/** @type {any} */ e) {
    if (e?.code !== 'EEXIST') throw e;
    err('error: promptcite.policy.json appeared while this ran. Nothing was written; run it again.');
    return 1;
  }
  log(`wrote ${file}`);
  log('Students working in this folder get the level and your rule at the start of /receipt, and a warning if a use goes past it.');
  return 0;
}

/** @param {string} q */
async function askLine(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return await rl.question(q); } finally { rl.close(); }
}
