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
  const referenced = new Set([...rule.matchAll(/`((?:brainstorm|outline|search|explain|edit|debug|draft|provenance|multi)\.\w+)`/g)].map((m) => m[1]));
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
