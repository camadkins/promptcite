// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAiLevel, runPolicyInit } from '../bin/policyinit.js';
import { readPolicyFile } from '../bin/course.js';
import { checkUses, CATEGORIES } from '../bin/level.js';

const RULE = 'You may use AI to brainstorm and outline. Everything you submit must be written by you.';

/** @param {(dir: string) => Promise<void>} fn */
async function inFolder(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'pc-pinit-'));
  try { await fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/** @param {string} dir @param {string[]} argv @param {any} [io] */
async function run(dir, argv, io = {}) {
  const out = [];
  const code = await runPolicyInit(argv, { cwd: dir, tty: false, log: (m) => out.push(m), err: (m) => out.push(m), ...io });
  return { code, out: out.join('\n') };
}

/** @param {string} dir */
const policyFile = (dir) => join(dir, 'promptcite.policy.json');

test('an AIAS level writes a policy the validator accepts, with the rule word for word', async () => {
  await inFolder(async (dir) => {
    const r = await run(dir, ['--scale', 'aias', '--level', '2', '--quote', RULE, '--where', 'Assignment 3 sheet', '--yes']);
    assert.equal(r.code, 0, r.out);
    const read = readPolicyFile(policyFile(dir));
    assert.deepEqual(read?.errors, []);
    assert.deepEqual(read?.policy.ai_level, { level: 2, quote: RULE, where: 'Assignment 3 sheet' });
    assert.match(r.out, /AI Assessment Scale \(AIAS\) level 2, AI Planning/);
    assert.deepEqual(checkUses(read?.policy.ai_level, ['draft']).over, ['draft']);
  });
});

test('lane 1 takes the uses the instructor allows, lane 2 allows everything', async () => {
  await inFolder(async (dir) => {
    assert.equal((await run(dir, ['--scale', 'lanes', '--level', '1', '--allows', 'brainstorm, explain', '--quote', 'Lane 1: brainstorm and explain only.', '--yes'])).code, 0);
    const lane1 = readPolicyFile(policyFile(dir));
    assert.deepEqual(lane1?.errors, []);
    assert.deepEqual(checkUses(lane1?.policy.ai_level, ['explain', 'draft']).over, ['draft']);
  });
  await inFolder(async (dir) => {
    assert.equal((await run(dir, ['--scale', 'lanes', '--level', '2', '--quote', 'Open assessment.', '--yes'])).code, 0);
    const lane2 = readPolicyFile(policyFile(dir));
    assert.deepEqual(checkUses(lane2?.policy.ai_level, CATEGORIES).over, []);
  });
  await inFolder(async (dir) => {
    assert.equal((await run(dir, ['--scale', 'lanes', '--level', '1', '--allows', 'none', '--quote', 'No AI in lane 1.', '--yes'])).code, 0);
    assert.deepEqual(checkUses(readPolicyFile(policyFile(dir))?.policy.ai_level, ['brainstorm']).over, ['brainstorm']);
  });
});

test('bad answers are refused and nothing is written', async () => {
  await inFolder(async (dir) => {
    const cases = [
      [['--level', '6', '--quote', RULE, '--yes'], /AIAS level is 1 to 5/],
      [['--level', '2', '--quote', '   ', '--yes'], /can't be empty/],
      [['--scale', 'lanes', '--level', '3', '--quote', RULE, '--yes'], /lane is 1 or 2/],
      [['--scale', 'lanes', '--level', '1', '--quote', RULE, '--yes'], /no terminal to ask: Which uses does lane 1 allow/],
      [['--scale', 'lanes', '--level', '1', '--allows', 'vibes', '--quote', RULE, '--yes'], /not a use category: vibes/],
      [['--scale', 'traffic-light', '--level', '1', '--quote', RULE, '--yes'], /aias or lanes/],
      [['--level', '2', '--yes'], /no terminal to ask/],
    ];
    for (const [argv, msg] of cases) {
      const r = await run(dir, /** @type {string[]} */ (argv));
      assert.equal(r.code, 1, String(argv));
      assert.match(r.out, /** @type {RegExp} */ (msg));
    }
    assert.ok(!existsSync(policyFile(dir)));
  });
});

test('an existing policy keeps its other keys, and its ai_level needs --force', async () => {
  await inFolder(async (dir) => {
    writeFileSync(policyFile(dir), JSON.stringify({ _comment: 'mine', required_citation_style: 'APA', ai_level: { level: 1, quote: 'No AI.' } }));
    const refused = await run(dir, ['--level', '2', '--quote', RULE, '--yes']);
    assert.equal(refused.code, 1);
    assert.match(refused.out, /already has an ai_level/);
    assert.equal((await run(dir, ['--level', '2', '--quote', RULE, '--force', '--yes'])).code, 0);
    const p = JSON.parse(readFileSync(policyFile(dir), 'utf8'));
    assert.equal(p.required_citation_style, 'APA');
    assert.equal(p._comment, 'mine');
    assert.equal(p.ai_level.level, 2);
  });
});

test('a broken existing file is left alone', async () => {
  await inFolder(async (dir) => {
    writeFileSync(policyFile(dir), '{ not json');
    const r = await run(dir, ['--level', '2', '--quote', RULE, '--yes']);
    assert.equal(r.code, 1);
    assert.equal(readFileSync(policyFile(dir), 'utf8'), '{ not json');
  });
});

test('without a terminal it won\'t write unless told to', async () => {
  await inFolder(async (dir) => {
    const r = await run(dir, ['--level', '2', '--quote', RULE]);
    assert.equal(r.code, 1);
    assert.match(r.out, /Pass --yes/);
    assert.ok(!existsSync(policyFile(dir)));
  });
});

test('the interactive path asks each question, shows the file, and writes on yes', async () => {
  await inFolder(async (dir) => {
    const answers = ['aias', '3', RULE, 'Final project sheet', 'y', 'y'];
    /** @type {string[]} */
    const asked = [];
    const r = await run(dir, [], { ask: async (/** @type {string} */ q) => { asked.push(q); return answers.shift() ?? ''; } });
    assert.equal(r.code, 0, r.out);
    assert.equal(asked.length, 6);
    assert.match(asked[2] ?? '', /word for word/);
    const p = readPolicyFile(policyFile(dir));
    assert.deepEqual(p?.errors, []);
    assert.equal(p?.policy.reflection, true);
    assert.equal(p?.policy.ai_level.quote, RULE);
    assert.match(r.out, /"level": 3/);
  });
  await inFolder(async (dir) => {
    const answers = ['lanes', '1', 'explain', 'Lane 1.', '', 'n', 'n'];
    const r = await run(dir, [], { ask: async () => answers.shift() ?? '' });
    assert.equal(r.code, 0);
    assert.match(r.out, /Nothing written/);
    assert.ok(!existsSync(policyFile(dir)));
  });
});

test('buildAiLevel trims the rule but never rewrites it', () => {
  assert.throws(() => buildAiLevel({ scale: 'lanes', level: 1, quote: RULE }), /lane 1 needs the uses it allows/);
  assert.equal(buildAiLevel({ scale: 'aias', level: 1, quote: `  ${RULE}\n` }).quote, RULE);
});

test('`promptcite policy init` is reachable from the main CLI', () => {
  const out = execFileSync(process.execPath, [fileURLToPath(new URL('../bin/install.js', import.meta.url)), 'policy', 'init', '--help'], { encoding: 'utf8' });
  assert.match(out, /--scale aias\|lanes/);
});
