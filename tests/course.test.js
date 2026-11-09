// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isSafeCourseId,
  coursePath,
  listCourses,
  loadCourse,
  resolveCoursesDir,
  validateCourse,
  validatePolicy,
} from '../bin/course.js';

const cli = new URL('../bin/install.js', import.meta.url).pathname;
const fixturePath = new URL('./fixtures/csce-423.json', import.meta.url).pathname;
const fixture = () => JSON.parse(readFileSync(fixturePath, 'utf8'));

// A sandbox with its own HOME (course files) and its own cwd (the homework
// folder), so nothing here reads or writes the real ~/.promptcite.
function sandbox(fn) {
  const root = mkdtempSync(join(tmpdir(), 'pc-course-'));
  const home = join(root, 'home');
  const cwd = join(root, 'work');
  mkdirSync(home);
  mkdirSync(cwd);
  const addCourse = (course, name = `${course.id}.json`) => {
    mkdirSync(resolveCoursesDir(home), { recursive: true });
    writeFileSync(join(resolveCoursesDir(home), name), JSON.stringify(course));
  };
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
  const config = () => JSON.parse(readFileSync(join(cwd, 'promptcite.config.json'), 'utf8'));
  try {
    return fn({ home, cwd, addCourse, run, config });
  } finally {
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
}

// --- validator -------------------------------------------------------------

test('the CSCE 423 fixture validates clean', () => {
  assert.deepEqual(validateCourse(fixture()), { errors: [], warnings: [] });
});

test('id and name are required', () => {
  const { errors } = validateCourse({ guidance: [] });
  assert.ok(errors.includes('id is required'));
  assert.ok(errors.some((e) => e.startsWith('name is required')));
});

test('a path-traversal id is rejected, and never becomes a path', () => {
  for (const id of ['../../etc/passwd', '..', 'csce/423', 'csce\\423', 'CSCE-423', 'csce.423', '-x', 'x-', 'a--b', '']) {
    assert.equal(isSafeCourseId(id), false, id);
    assert.equal(coursePath(id, '/home/s'), null, id);
  }
  const { errors } = validateCourse({ ...fixture(), id: '../../etc/passwd' });
  assert.ok(errors.some((e) => /not a safe course id/.test(e)));
  assert.equal(isSafeCourseId('csce-423'), true);
});

test('a guidance line with no quote fails, and so does one with no rule', () => {
  const course = fixture();
  course.guidance.push({ rule: 'AI is fine for debugging.' });
  course.guidance.push({ rule: '  ', quote: 'Some text.' });
  course.guidance.push({ rule: 'Blank quote.', quote: '   ' });
  const { errors } = validateCourse(course);
  assert.ok(errors.some((e) => e.startsWith('guidance[3] has no quote')));
  assert.ok(errors.includes('guidance[4] has no rule'));
  assert.ok(errors.some((e) => e.startsWith('guidance[5] has no quote')));
});

test('an unknown policy key fails', () => {
  const { errors } = validateCourse({ ...fixture(), policy: { allow_everything: true } });
  assert.ok(errors.some((e) => e.startsWith('policy.allow_everything is not a policy key')));
});

test('require_ledger, require_markers, and require_attestation are assignment-only', () => {
  for (const key of ['require_ledger', 'require_markers', 'require_attestation']) {
    const { errors } = validateCourse({ ...fixture(), policy: { [key]: true } });
    assert.ok(errors.some((e) => e.startsWith(`policy.${key} is assignment-only`)), key);
  }
});

test('policy values are type-checked', () => {
  const { errors } = validateCourse({
    ...fixture(),
    policy: {
      profile: 'poetry',
      allowed_categories: ['brainstorm', 'vibes'],
      required_citation_style: 'mla',
      disclosure_language: 3,
      require_source_verification: 'search',
      required_appendix: { debug: 'screenshot', nap: 'full_transcript' },
      reflection: 'yes',
    },
  });
  for (const key of ['profile', 'allowed_categories', 'required_citation_style', 'disclosure_language', 'require_source_verification', 'reflection']) {
    assert.ok(errors.some((e) => e.startsWith(`policy.${key}`)), key);
  }
  assert.ok(errors.some((e) => e.startsWith('policy.required_appendix.debug')));
  assert.ok(errors.some((e) => e.startsWith('policy.required_appendix.nap')));
});

test('unknown top-level keys warn but do not fail', () => {
  const { errors, warnings } = validateCourse({ ...fixture(), office_hours: 'Tue 2pm' });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, ['unknown key "office_hours" is ignored']);
});

test('source.file is a name only, and source.added is a date', () => {
  const { errors } = validateCourse({ ...fixture(), source: { file: '/Users/s/Downloads/syllabus.pdf', added: 'last week' } });
  assert.ok(errors.includes('source.file must be the file name only, not a path'));
  assert.ok(errors.some((e) => e.startsWith('source.added')));
});

test('unclear entries need a topic; the quote is optional', () => {
  assert.deepEqual(validateCourse({ ...fixture(), unclear: [{ topic: 'Group work' }] }).errors, []);
  assert.ok(validateCourse({ ...fixture(), unclear: [{ quote: 'x' }] }).errors.includes('unclear[0] needs a topic'));
});

test('a course with neither guidance nor policy warns that it says nothing', () => {
  const { errors, warnings } = validateCourse({ id: 'empty', name: 'EMPTY 100' });
  assert.deepEqual(errors, []);
  assert.match(warnings[0], /tells PromptCite nothing/);
});

test('loadCourse and listCourses read the sandboxed home', () => sandbox(({ home, addCourse }) => {
  assert.equal(loadCourse('csce-423', home), null);
  assert.deepEqual(listCourses(home), []);
  addCourse(fixture());
  addCourse({ ...fixture(), id: 'other' }, 'mismatch.json');
  const loaded = loadCourse('csce-423', home);
  assert.equal(loaded?.course.name, 'CSCE 423');
  assert.deepEqual(loaded?.errors, []);
  const list = listCourses(home);
  assert.deepEqual(list.map((e) => e.id), ['csce-423', 'mismatch']);
  assert.ok(list[1]?.errors.some((e) => /doesn't match the file name/.test(e)));
}));

// --- CLI -------------------------------------------------------------------

test('course with no course files says how to add one', () => sandbox(({ run, cwd }) => {
  const { code, out } = run(['course']);
  assert.equal(code, 0);
  assert.match(out, /No course files yet/);
  assert.match(out, /\/receipt course add/);
  assert.equal(readdirSync(cwd).length, 0, 'listing writes nothing');
}));

test('course lists course files and marks the one bound here', () => sandbox(({ run, addCourse }) => {
  addCourse(fixture());
  addCourse({ id: 'engl-251', name: 'ENGL 251', guidance: [{ rule: 'r', quote: 'q' }] });
  assert.doesNotMatch(run(['course']).out, /this folder/);
  run(['course', 'use', 'csce-423']);
  const { code, out } = run(['course', 'list']);
  assert.equal(code, 0);
  assert.match(out, /csce-423\s+CSCE 423 Fall 2026 \(this folder\)/);
  assert.match(out, /engl-251\s+ENGL 251/);
}));

test('course show prints each rule with the syllabus quote and the open questions', () => sandbox(({ run, addCourse }) => {
  addCourse(fixture());
  const { code, out } = run(['course', 'show', 'csce-423']);
  assert.equal(code, 0);
  assert.match(out, /CSCE 423 \(csce-423\)/);
  assert.match(out, /not to solve a homework problem/);
  assert.match(out, /"Exams are closed-book and closed-device\. No AI tools\." \(Exams, p\. 2\)/);
  assert.match(out, /ask your instructor/);
  assert.match(out, /from csce423-syllabus-fall2026\.pdf, added 2026-08-24/);
}));

test('course show refuses a traversal id and a missing course with exit 1', () => sandbox(({ run }) => {
  const traversal = run(['course', 'show', '../../etc/passwd']);
  assert.equal(traversal.code, 1);
  assert.match(traversal.out, /is not a course id/);
  const missing = run(['course', 'show', 'nope-101']);
  assert.equal(missing.code, 1);
  assert.match(missing.out, /no course "nope-101"/);
}));

test('course use binds the folder and keeps other settings; clear removes only the binding', () => sandbox(({ run, addCourse, cwd, config }) => {
  addCourse(fixture());
  writeFileSync(join(cwd, 'promptcite.config.json'), JSON.stringify({ citation_style: 'APA', ledger: { enabled: true } }));
  const used = run(['course', 'use', 'csce-423']);
  assert.equal(used.code, 0);
  assert.match(used.out, /CSCE 423/);
  assert.equal(config().course, 'csce-423');
  assert.equal(config().citation_style, 'APA');
  assert.equal(config().ledger.enabled, true);

  const cleared = run(['course', 'clear']);
  assert.equal(cleared.code, 0);
  assert.equal(config().course, undefined);
  assert.equal(config().citation_style, 'APA');
  assert.match(run(['course', 'clear']).out, /no course was bound here/);
}));

test('course use refuses a course that does not exist or does not validate', () => sandbox(({ run, addCourse, cwd }) => {
  assert.equal(run(['course', 'use', 'nope-101']).code, 1);
  addCourse({ ...fixture(), guidance: [{ rule: 'Unquoted.' }] });
  const { code, out } = run(['course', 'use', 'csce-423']);
  assert.equal(code, 1);
  assert.match(out, /has no quote/);
  assert.equal(existsSync(join(cwd, 'promptcite.config.json')), false, 'nothing bound on failure');
}));

test('course check passes the fixture and fails a bad file with reasons', () => sandbox(({ run, cwd }) => {
  const ok = run(['course', 'check', fixturePath]);
  assert.equal(ok.code, 0);
  assert.match(ok.out, /valid:/);

  const bad = join(cwd, 'draft.json');
  writeFileSync(bad, JSON.stringify({
    id: '../escape',
    name: 'X',
    policy: { require_ledger: true, vibes: 'yes' },
    guidance: [{ rule: 'No quote here.' }],
  }));
  const { code, out } = run(['course', 'check', 'draft.json']);
  assert.equal(code, 1);
  assert.match(out, /invalid:/);
  assert.match(out, /not a safe course id/);
  assert.match(out, /policy\.require_ledger is assignment-only/);
  assert.match(out, /policy\.vibes is not a policy key/);
  assert.match(out, /guidance\[0\] has no quote/);
}));

test('course check reports unparseable JSON and a missing file with exit 1', () => sandbox(({ run, cwd }) => {
  writeFileSync(join(cwd, 'broken.json'), '{ nope');
  assert.match(run(['course', 'check', 'broken.json']).out, /not valid JSON/);
  assert.equal(run(['course', 'check', 'broken.json']).code, 1);
  assert.equal(run(['course', 'check', 'missing.json']).code, 1);
}));

test('course check warns when a valid file is not named for its id', () => sandbox(({ run, cwd }) => {
  writeFileSync(join(cwd, 'draft.json'), JSON.stringify(fixture()));
  const { code, out } = run(['course', 'check', 'draft.json']);
  assert.equal(code, 0);
  assert.match(out, /warning: save it as .*csce-423\.json/);
}));

test('course subcommand misuse is a user error', () => sandbox(({ run }) => {
  assert.equal(run(['course', 'sideways']).code, 1);
  assert.equal(run(['course', 'show']).code, 1);
  assert.equal(run(['course', 'check']).code, 1);
  assert.equal(run(['course', 'clear', 'csce-423']).code, 1);
  assert.equal(run(['course', 'use', 'a', 'b']).code, 2, 'too many words is refused by the parser');
}));

test('status shows the bound course, or that none is bound', () => sandbox(({ run, addCourse }) => {
  assert.match(run(['status']).out, /course:\s+none bound here/);
  addCourse(fixture());
  run(['course', 'use', 'csce-423']);
  assert.match(run(['status']).out, /course:\s+CSCE 423 \(csce-423\)/);
}));

test('status flags a binding whose course file is gone or unsafe', () => sandbox(({ run, cwd }) => {
  writeFileSync(join(cwd, 'promptcite.config.json'), JSON.stringify({ course: 'gone-101' }));
  assert.match(run(['status']).out, /course:\s+gone-101 \(no such course file\)/);
  writeFileSync(join(cwd, 'promptcite.config.json'), JSON.stringify({ course: '../../x' }));
  assert.match(run(['status']).out, /no such course file/);
}));

test('course use --dry-run writes nothing', () => sandbox(({ run, addCourse, cwd }) => {
  addCourse(fixture());
  assert.equal(run(['course', 'use', 'csce-423', '--dry-run']).code, 0);
  assert.equal(existsSync(join(cwd, 'promptcite.config.json')), false);
}));

test('reflection is a course policy key and takes true or false', () => {
  assert.deepEqual(validateCourse({ ...fixture(), policy: { reflection: true } }).errors, []);
  assert.deepEqual(validatePolicy({ reflection: false }).errors, []);
  assert.deepEqual(validatePolicy({ reflection: 'on' }).errors, ['reflection must be true or false']);
});
