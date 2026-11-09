// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  LOCALES_MARKER,
  buildGemini,
  composeRule,
  loadLocales,
  parseLocale,
  validateLocales,
} from '../bin/rule.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const en = readFileSync(new URL('../src/locales/en.md', import.meta.url), 'utf8');

// A translator's file, built the way the README tells them to: copy en.md,
// change the frontmatter, rewrite the text under each heading.
function copyOfEnglish(code, rewrite = (key, value) => value) {
  const ref = parseLocale(en, 'src/locales/en.md');
  const body = [...ref.strings].map(([key, value]) => `## ${key}\n${rewrite(key, value)}\n`).join('\n');
  return `---\ncode: ${code}\nname: Test\nstatus: needs-review\n---\n\n${body}`;
}

test('every shipped locale is valid against en.md', async () => {
  const problems = validateLocales(await loadLocales(repoRoot));
  assert.deepEqual(problems, []);
});

test('en.md parses its keys and drops translator notes', () => {
  const locale = parseLocale(en, 'src/locales/en.md');
  assert.equal(locale.code, 'en');
  assert.equal(
    locale.strings.get('brainstorm.lead'),
    'I used {tool} ({model}) on {date} to brainstorm {summary} for this assignment.',
  );
  for (const value of locale.strings.values()) {
    assert.doesNotMatch(value, /(^|\s)>/, 'a > note leaked into a string');
  }
});

test('every category the rule names has a lead string', () => {
  const locale = parseLocale(en, 'src/locales/en.md');
  for (const category of ['brainstorm', 'outline', 'search', 'explain', 'edit', 'debug', 'draft']) {
    assert.ok(locale.strings.has(`${category}.lead`), `${category}.lead missing`);
  }
});

test('every key the rule references exists in en.md, and every en.md key is referenced', () => {
  const rule = readFileSync(new URL('../src/rules/receipt.md', import.meta.url), 'utf8');
  const keys = [...parseLocale(en, 'src/locales/en.md').strings.keys()];
  const referenced = new Set([...rule.matchAll(/`((?:brainstorm|outline|search|explain|edit|debug|draft|provenance|multi|extent|cite|none|journal|short)\.\w+)`/g)].map((m) => m[1]));
  for (const key of referenced) assert.ok(keys.includes(key), `rule references ${key}, which en.md lacks`);
  for (const key of keys) assert.ok(referenced.has(key), `en.md has ${key}, which the rule never uses`);
});

test('a complete translation passes', () => {
  const es = parseLocale(copyOfEnglish('es', (key, value) => `ES ${value}`), 'src/locales/es.md');
  assert.deepEqual(validateLocales([parseLocale(en, 'src/locales/en.md'), es]), []);
});

test('a missing key is reported by name', () => {
  const text = copyOfEnglish('es').replace(/## debug\.code_kept\n[^\n]*\n/, '');
  const problems = validateLocales([parseLocale(en, 'src/locales/en.md'), parseLocale(text, 'src/locales/es.md')]);
  assert.deepEqual(problems, ['src/locales/es.md: missing "## debug.code_kept"']);
});

test('a translated placeholder is reported', () => {
  const text = copyOfEnglish('es', (key, value) => (key === 'brainstorm.lead' ? value.replace('{tool}', '{herramienta}') : value));
  const problems = validateLocales([parseLocale(en, 'src/locales/en.md'), parseLocale(text, 'src/locales/es.md')]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /brainstorm\.lead.*placeholders/);
});

test('an unknown key, an empty key, and a mismatched file name are all reported', () => {
  const text = `${copyOfEnglish('es', (key, value) => (key === 'explain.content' ? '' : value))}\n## explain.extra\nHola.\n`;
  const problems = validateLocales([parseLocale(en, 'src/locales/en.md'), parseLocale(text, 'src/locales/spanish.md')]);
  assert.ok(problems.some((p) => p.includes('should be es.md')));
  assert.ok(problems.some((p) => p.includes('"## explain.content" has no text')));
  assert.ok(problems.some((p) => p.includes('"## explain.extra" is not a key')));
});

test('a file with no frontmatter is rejected with its name', () => {
  assert.throws(() => parseLocale('## brainstorm.lead\nHola', 'src/locales/es.md'), /es\.md: missing frontmatter/);
});

test('the composed rule has the strings in place of the marker', async () => {
  const rule = await composeRule(repoRoot);
  assert.ok(!rule.includes(LOCALES_MARKER));
  assert.match(rule, /\*\*English \(`en`\)\*\*/);
  assert.match(rule, /- `provenance\.agent_reported`: This receipt was generated inside \{tool\} itself/);
});

test('GEMINI.md is the composed rule', async () => {
  const gemini = readFileSync(new URL('../GEMINI.md', import.meta.url), 'utf8');
  assert.equal(gemini, await buildGemini(repoRoot), 'run: node bin/rule.js --write-gemini');
});

test('cite.rule carries the course, the quote, and the lead, and the rule only offers it on a yes', () => {
  const strings = parseLocale(en, 'src/locales/en.md').strings;
  const cite = strings.get('cite.rule') ?? '';
  for (const p of ['{course}', '{quote}', '{lead}']) assert.ok(cite.includes(p), `cite.rule lacks ${p}`);
  const rule = readFileSync(new URL('../src/rules/receipt.md', import.meta.url), 'utf8');
  assert.match(rule, /\*\*Citing the course rule \(opt-in, one quote per paragraph\)\.\*\*/);
  assert.match(rule, /Never offer one when any use is over the level/);
  assert.match(rule, /Cite a course rule in a disclosure without the student's yes/);
});

test('the course-rule example quotes its syllabus word for word, and the draft example cites nothing', () => {
  const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
  const course = read('./fixtures/csce-423.json');
  const cited = read('../examples/course-rule-receipt.json').outputs.disclosure_statement;
  const m = /^Per the CSCE 423 AI policy \("([^"]+)"\), I used /.exec(cited);
  assert.ok(m, cited);
  assert.ok(course.guidance.some((g) => g.quote.includes(m[1])), `"${m[1]}" is not in the fixture's guidance`);
  assert.doesNotMatch(read('../examples/draft-receipt.json').outputs.disclosure_statement, /^Per the /);
});

test('the journal form is Elsevier wording with only the author resolved', () => {
  const strings = parseLocale(en, 'src/locales/en.md').strings;
  assert.equal(
    strings.get('journal.heading'),
    'Declaration of generative AI and AI-assisted technologies in the manuscript preparation process',
  );
  // Elsevier policy, updated June 2026, with author(s) / take(s) resolved for one author.
  const elsevier = 'During the preparation of this work the author(s) used [NAME OF TOOL/SERVICE] in order to [REASON]. After using this tool/service, the author(s) reviewed and edited the content as needed and take(s) full responsibility for the content of the publication.';
  const ours = elsevier
    .replaceAll('author(s)', 'author')
    .replace('take(s)', 'takes')
    .replace('[NAME OF TOOL/SERVICE]', '{tools}')
    .replace('[REASON]', '{reasons}');
  assert.equal(strings.get('journal.statement'), ours);
});

test('the other-form examples follow their strings and stay short', () => {
  const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
  const journal = read('../examples/journal-receipt.json');
  assert.match(journal.outputs.journal_statement, /^During the preparation of this work the author used ChatGPT \(GPT-4o\) and Claude \(Claude Sonnet 4\.6\) in order to /);
  assert.match(journal.outputs.journal_statement, /takes full responsibility for the content of the publication\.$/);
  const short = read('../examples/short-receipt.json').outputs.short_statement;
  assert.match(short, /^I used Copilot \(GPT-4\.1\) on this assignment to .+\. My AI-use receipt has the details\.$/);
  assert.ok(short.length <= 300, `${short.length} chars`);
  for (const f of ['brainstorm', 'draft', 'course-rule', 'multi-session']) {
    const o = read(`../examples/${f}-receipt.json`).outputs;
    assert.equal(o.short_statement, undefined, f);
    assert.equal(o.journal_statement, undefined, f);
  }
});

test('the no-AI declaration is a statement, checks first, and never claims proof', () => {
  const strings = parseLocale(en, 'src/locales/en.md').strings;
  assert.equal(strings.get('none.statement'), 'I did not use generative AI tools for any part of this assignment.');
  assert.ok((strings.get('none.basic_tools') ?? '').includes('{tools}'));
  const rule = readFileSync(new URL('../src/rules/receipt.md', import.meta.url), 'utf8');
  const section = rule.slice(rule.indexOf('## No-AI declaration'), rule.indexOf('## Interview flow'));
  assert.match(section, /no JSON is written and nothing is hashed/);
  assert.match(section, /If the ledger \(when enabled\) has entries for\s+this folder/);
  assert.match(section, /Never call the\s+declaration proof, evidence, or verification/);
  assert.match(rule, /- \*\*`none`\*\* \(or `--none`\)/);
  const example = readFileSync(new URL('../examples/no-ai-declaration.md', import.meta.url), 'utf8');
  assert.ok(example.includes(strings.get('none.statement')));
  assert.match(example, /not proof of anything/);
});

test('the reflection step asks four questions, stores them verbatim, and only when turned on', () => {
  const rule = readFileSync(new URL('../src/rules/receipt.md', import.meta.url), 'utf8');
  const step = rule.slice(rule.indexOf('### Step 4a'), rule.indexOf('### Step 4b'));
  assert.match(step, /when `reflection` is true in an instructor policy, a course file's\s+policy, or the student's settings/);
  for (const q of ['What did you try before using AI?', 'Why did you turn to AI at that point?', 'What did you change about what it gave you, and why?', 'Would you use AI the same way next time?']) {
    assert.ok(step.includes(q), q);
  }
  for (const k of ['tried_first', 'why_ai', 'what_changed', 'use_again']) assert.ok(step.includes(`\`${k}\``), k);
  assert.match(step, /Never write, summarize, or improve an answer/);
  assert.match(step, /never goes into the disclosure paragraph/);
  const r = JSON.parse(readFileSync(new URL('../examples/reflection-receipt.json', import.meta.url), 'utf8'));
  for (const v of Object.values(r.reflection)) assert.ok(!r.outputs.disclosure_statement.includes(String(v)), 'reflection leaked into the paragraph');
});

test('the file step lists from markers, asks the student for every role, and counts nothing', () => {
  const rule = readFileSync(new URL('../src/rules/receipt.md', import.meta.url), 'utf8');
  const step = rule.slice(rule.indexOf('### Step 3b'), rule.indexOf('### Step 4 '));
  assert.match(step, /promptcite-check --files --json/);
  assert.match(step, /Never pick a role for the student/);
  assert.match(step, /Don't count lines or markers/);
  assert.match(step, /never treat leaving it out as the AI use not having happened/);
  const r = JSON.parse(readFileSync(new URL('../examples/files-receipt.json', import.meta.url), 'utf8'));
  assert.ok(r.code_files.some((/** @type {any} */ f) => f.source === 'student'));
  for (const f of r.code_files) assert.deepEqual(Object.keys(f).sort(), ['file', 'role', 'source', 'tools']);
});

test('the source check flags unconfirmed sources by name before output, and never looks them up', () => {
  const rule = readFileSync(new URL('../src/rules/receipt.md', import.meta.url), 'utf8');
  const step = rule.slice(rule.indexOf('### Step 4c'), rule.indexOf('### Step 5 '));
  assert.match(step, /AI tools make up sources that look real/);
  assert.match(step, /Name each unconfirmed source; don't count them/);
  assert.match(step, /doesn't block the receipt/);
  assert.match(rule, /Never look a source up, never mark one\s+confirmed on their behalf/);
  assert.ok(rule.indexOf('### Step 4b') < rule.indexOf('### Step 4c'), 'steps out of order');
  const partly = parseLocale(en, 'src/locales/en.md').strings.get('search.partly_verified') ?? '';
  for (const p of ['{confirmed}', '{unconfirmed}', '{verified_against}']) assert.ok(partly.includes(p), p);
});

test('allowed_categories warns and never narrows what a student can record', () => {
  const rule = readFileSync(new URL('../src/rules/receipt.md', import.meta.url), 'utf8');
  assert.doesNotMatch(rule, /ask (them|for) (to choose )?an allowed one/i);
  assert.doesNotMatch(rule, /offer only (these|those)/i);
  assert.match(rule, /Never ask\s+them to pick an allowed one instead/);
  assert.match(rule, /\*\*`allowed_categories` too\.\*\*/);
  for (const topic of ['student', 'instructor']) {
    const guide = readFileSync(new URL(`../src/help/getting-started-${topic}.md`, import.meta.url), 'utf8');
    assert.match(guide, /never blocks/, `${topic} guide must say it never blocks`);
  }
});
