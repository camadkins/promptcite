// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIAS, CATEGORIES, checkAiLevel, checkUses, describeLevel, matchAssignments, resolveAiLevel } from '../bin/level.js';
import { CATEGORIES as COURSE_CATEGORIES, resolveCoursesDir, validateCourse, validatePolicy } from '../bin/course.js';

const cli = new URL('../bin/install.js', import.meta.url).pathname;
const fixturePath = new URL('./fixtures/engl-150.json', import.meta.url).pathname;
const fixture = () => JSON.parse(readFileSync(fixturePath, 'utf8'));
const schema = readFileSync(new URL('../src/schema.yaml', import.meta.url), 'utf8');

const level2 = {
  level: 2,
  quote: 'You may use AI to brainstorm and outline, but every sentence you submit must be your own.',
  where: 'AI Use, p. 4',
};

/** @param {unknown} value */
const problems = (value) => {
  const errors = [];
  checkAiLevel(value, 'ai_level', errors);
  return errors;
};

// --- the scale -------------------------------------------------------------

test('categories are one list, and it matches the schema', () => {
  assert.equal(COURSE_CATEGORIES, CATEGORIES);
  for (const c of CATEGORIES) assert.match(schema, new RegExp(`\\b${c}\\b`), `${c} missing from schema.yaml`);
});

test('AIAS has the five published levels in order', () => {
  assert.deepEqual(AIAS.levels.map((l) => [l.level, l.label]), [
    [1, 'No AI'], [2, 'AI Planning'], [3, 'AI Collaboration'], [4, 'Full AI'], [5, 'AI Exploration'],
  ]);
  assert.deepEqual(AIAS.levels[0].allows, []);
  for (const l of AIAS.levels) assert.ok(l.allows.every((c) => CATEGORIES.includes(c)));
});

// --- validation ------------------------------------------------------------

test('an AIAS level with a quote is valid, by number or by "2"', () => {
  assert.deepEqual(problems(level2), []);
  assert.deepEqual(problems({ ...level2, scale: 'aias', level: '2' }), []);
});

test('a level needs a quote', () => {
  const { quote, ...noQuote } = level2;
  assert.match(problems(noQuote).join('\n'), /has no quote/);
  assert.match(problems({ ...level2, quote: '   ' }).join('\n'), /has no quote/);
});

test('a level outside the scale, an unknown scale, or a stray key is an error', () => {
  assert.match(problems({ ...level2, level: 6 }).join('\n'), /level must be one of 1, 2, 3, 4, 5/);
  assert.match(problems({ ...level2, scale: 'traffic-light' }).join('\n'), /must be "aias" or a custom scale/);
  assert.match(problems({ ...level2, lvl: 2 }).join('\n'), /lvl is not an ai_level key/);
  assert.match(problems('level 2').join('\n'), /must be an object/);
});

const traffic = {
  name: 'Traffic light',
  levels: [
    { level: 'red', label: 'No AI', allows: [] },
    { level: 'amber', label: 'Ideas only', allows: ['brainstorm', 'explain'] },
    { level: 'green', label: 'Open', allows: CATEGORIES },
  ],
};

test('a custom scale is valid and matched by name, ignoring case', () => {
  assert.deepEqual(problems({ scale: traffic, level: 'Amber', quote: 'Amber: ideas only.' }), []);
});

test('a broken custom scale says what is wrong', () => {
  const dup = { ...traffic, levels: [...traffic.levels, { level: 'RED', label: 'again', allows: [] }] };
  assert.match(problems({ scale: dup, level: 'red', quote: 'x' }).join('\n'), /appears twice/);
  const badAllows = { ...traffic, levels: [{ level: 'red', label: 'No AI', allows: ['write'] }] };
  assert.match(problems({ scale: badAllows, level: 'red', quote: 'x' }).join('\n'), /allows must be a list drawn from/);
  assert.match(problems({ scale: { name: 'Empty', levels: [] }, level: 1, quote: 'x' }).join('\n'), /levels must be a non-empty list/);
});

// --- the warning -----------------------------------------------------------

test('level 2 plus a draft use warns, quoting the rule word for word', () => {
  const result = checkUses(level2, ['brainstorm', 'draft']);
  assert.deepEqual(result.over, ['draft']);
  assert.equal(result.warning, [
    'This assignment is AI Assessment Scale (AIAS) level 2, AI Planning: it allows brainstorm, outline, search, explain.',
    'Your logged use "draft" goes past that.',
    `The rule: "${level2.quote}" (AI Use, p. 4)`,
    'Disclose it anyway. An honest receipt is still the right one, and your instructor decides what it means.',
  ].join('\n'));
});

test('uses inside the level give no warning', () => {
  const result = checkUses(level2, ['brainstorm', 'outline', 'explain']);
  assert.deepEqual(result.over, []);
  assert.equal(result.warning, null);
});

test('level 1 flags every use, once each, and says no AI is allowed', () => {
  const result = checkUses({ level: 1, quote: 'No AI.' }, ['explain', 'explain', 'search']);
  assert.deepEqual(result.over, ['explain', 'search']);
  assert.match(/** @type {string} */ (result.warning), /No AI: it allows no AI use\.\nYour logged use "explain", "search" go past that\./);
});

test('a custom scale warns in its own words', () => {
  const result = checkUses({ scale: traffic, level: 'amber', quote: 'Amber: ideas only.' }, ['edit']);
  assert.match(/** @type {string} */ (result.warning), /^This assignment is Traffic light level amber, Ideas only: it allows brainstorm, explain\./);
});

test('checkUses refuses an invalid level rather than guessing', () => {
  assert.throws(() => checkUses({ level: 9, quote: 'x' }, ['draft']), /level must be one of/);
});

test('describeLevel names the level and what it allows', () => {
  assert.equal(describeLevel(level2), 'AI Assessment Scale (AIAS) level 2, AI Planning (allows brainstorm, outline, search, explain)');
  assert.equal(describeLevel({ level: 1, quote: 'x' }), 'AI Assessment Scale (AIAS) level 1, No AI (allows no AI use)');
});

// --- precedence and assignments --------------------------------------------

test('assignment policy beats a course assignment, which beats the course policy', () => {
  const course = fixture();
  const [reflection] = matchAssignments(course, 'Reflection');
  const policy = { ai_level: { level: 4, quote: 'Anything goes on this one.' } };
  assert.equal(resolveAiLevel({ policy, course, assignment: reflection })?.from, 'assignment policy');
  assert.equal(resolveAiLevel({ course, assignment: reflection })?.aiLevel.level, 1);
  assert.equal(resolveAiLevel({ course })?.from, 'course policy');
  assert.equal(resolveAiLevel({ policy: {}, course: { policy: {} } }), null);
  assert.equal(resolveAiLevel(), null);
});

test('assignments match by name or alias, ignoring case, spaces, and dashes', () => {
  const course = fixture();
  assert.equal(matchAssignments(course, 'weekly-reflection')[0].name, 'Reflection');
  assert.equal(matchAssignments(course, 'FINAL PROJECT')[0].name, 'Final project');
  assert.deepEqual(matchAssignments(course, 'midterm'), []);
  assert.deepEqual(matchAssignments({ id: 'x' }, 'final'), []);
});

// --- course files and policy files -----------------------------------------

test('the ENGL 150 fixture validates clean', () => {
  assert.deepEqual(validateCourse(fixture()), { errors: [], warnings: [] });
});

test('a course file checks its assignments', () => {
  const course = fixture();
  course.assignments.push({ name: 'Journal', ai_level: { level: 1 } }, { aliases: ['x'] });
  const { errors } = validateCourse(course);
  assert.ok(errors.includes('assignments[2] reuses the name "Journal" from assignments[0]'), errors.join('\n'));
  assert.ok(errors.includes('assignments[2].ai_level has no quote: the level needs the rule\'s own words'), errors.join('\n'));
  assert.ok(errors.includes('assignments[3] has no name, like "Homework"'), errors.join('\n'));
  assert.ok(errors.includes('assignments[3] has no ai_level'), errors.join('\n'));
});

test('a course policy ai_level is checked like any other key', () => {
  const course = fixture();
  course.policy.ai_level.level = 0;
  assert.match(validateCourse(course).errors.join('\n'), /policy\.ai_level\.level must be one of/);
});

test('a course file with only assignments is not "tells PromptCite nothing"', () => {
  const { policy, guidance, ...rest } = fixture();
  assert.deepEqual(validateCourse(rest).warnings, []);
});

test('an assignment policy file takes ai_level and the capture switches', () => {
  assert.deepEqual(validatePolicy({ ai_level: level2, require_ledger: true, allowed_categories: ['outline'] }).errors, []);
  assert.deepEqual(validatePolicy({ require_markers: 'yes' }).errors, ['require_markers must be true or false']);
  assert.match(validatePolicy({ ai_levle: level2 }).errors.join('\n'), /ai_levle is not a policy key \(allowed: .*require_attestation\)/);
  assert.match(validatePolicy({ ai_level: { level: 2 } }).errors.join('\n'), /^ai_level has no quote/);
});

test('the example policy file in docs validates', () => {
  const example = JSON.parse(readFileSync(new URL('../docs/promptcite.policy.example.json', import.meta.url), 'utf8'));
  assert.deepEqual(validatePolicy(example).errors, []);
  assert.ok(example.ai_level, 'the example should show ai_level');
});

// --- the CLI ---------------------------------------------------------------

function sandbox(fn) {
  const root = mkdtempSync(join(tmpdir(), 'pc-level-'));
  const home = join(root, 'home');
  const cwd = join(root, 'work');
  mkdirSync(home);
  mkdirSync(cwd);
  mkdirSync(resolveCoursesDir(home), { recursive: true });
  writeFileSync(join(resolveCoursesDir(home), 'engl-150.json'), JSON.stringify(fixture()));
  const run = (args) => {
    try {
      const out = execFileSync('node', [cli, ...args, '--no-color'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: '1' },
      });
      return { code: 0, out };
    } catch (e) {
      return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
    }
  };
  const writePolicy = (p) => writeFileSync(join(cwd, 'promptcite.policy.json'), JSON.stringify(p));
  try {
    return fn({ run, writePolicy });
  } finally {
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
}

test('policy check with nothing set says so', () => sandbox(({ run }) => {
  const r = run(['policy', 'check', 'draft']);
  assert.equal(r.code, 0);
  assert.match(r.out, /no AI level is set for this work/);
}));

test('policy check warns from the assignment policy file, quoting it', () => sandbox(({ run, writePolicy }) => {
  writePolicy({ ai_level: level2 });
  const r = run(['policy', 'check', 'brainstorm', 'draft']);
  assert.equal(r.code, 0);
  assert.match(r.out, /level: AI Assessment Scale \(AIAS\) level 2, AI Planning .*from the assignment policy/);
  assert.match(r.out, /over: draft/);
  assert.ok(r.out.includes(`The rule: "${level2.quote}" (AI Use, p. 4)`), r.out);
}));

test('policy check says within when nothing is over', () => sandbox(({ run, writePolicy }) => {
  writePolicy({ ai_level: level2 });
  const r = run(['policy', 'check', 'outline']);
  assert.match(r.out, /within: outline/);
  assert.doesNotMatch(r.out, /over:/);
}));

test('policy check uses the bound course, and --assignment picks one of its assignments', () => sandbox(({ run }) => {
  run(['course', 'use', 'engl-150']);
  assert.match(run(['policy', 'check', 'edit']).out, /level 2, AI Planning .*from the course policy[\s\S]*over: edit/);
  const r = run(['policy', 'check', 'explain', '--assignment', 'journal']);
  assert.match(r.out, /level 1, No AI .*from the course assignment[\s\S]*over: explain/);
  assert.ok(r.out.includes('Reflections are written without AI tools of any kind.'), r.out);
  assert.match(run(['policy', 'check', 'draft', '--assignment', 'final']).out, /within: draft/);
}));

test('policy check --course works without a binding', () => sandbox(({ run }) => {
  assert.match(run(['policy', 'check', '--course', 'engl-150']).out, /level 2, AI Planning/);
}));

test('policy check reports user errors with exit 1', () => sandbox(({ run, writePolicy }) => {
  assert.equal(run(['policy', 'check', 'write']).code, 1);
  assert.equal(run(['policy', 'lint']).code, 1);
  assert.match(run(['policy', 'check', '--assignment', 'final']).out, /--assignment needs a course/);
  assert.match(run(['policy', 'check', '--course', 'engl-150', '--assignment', 'midterm']).out, /no assignment "midterm" in ENGL 150 \(it has: Reflection, Final project\)/);
  assert.match(run(['policy', 'check', '--course', 'nope-101']).out, /no course "nope-101"/);
  writePolicy({ ai_level: { level: 2 } });
  const bad = run(['policy', 'check']);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /invalid:[\s\S]*ai_level has no quote/);
}));

test('--course and --assignment are only for policy check', () => sandbox(({ run }) => {
  const r = run(['status', '--course', 'engl-150']);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /go with "policy check"/);
}));

test('course show lists the course level and each assignment level with its quote', () => sandbox(({ run }) => {
  const r = run(['course', 'show', 'engl-150']);
  assert.equal(r.code, 0);
  assert.match(r.out, /ai_level: AI Assessment Scale \(AIAS\) level 2, AI Planning/);
  assert.match(r.out, /AI level by assignment\n {2}- Reflection \(also weekly reflection, journal\): AI Assessment Scale \(AIAS\) level 1, No AI/);
  assert.ok(r.out.includes('"For the final project you may work with AI on drafting and revision, and you must say how." (Final Project, p. 6)'), r.out);
}));
