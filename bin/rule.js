#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins
// Builds the /receipt rule every agent actually loads.
//
// src/rules/receipt.md holds the behavior. src/locales/*.md hold the strings
// the disclosure paragraph is built from, one file per language, the way an
// app keeps its UI text in a string table. The rule carries a marker where the
// strings go; composeRule() swaps the marker for every shipped language.
//
// Composition happens here, not at runtime, because agents load the rule as a
// single file from wherever their adapter put it. There is no path an agent
// could follow back to src/locales/. GEMINI.md is the composed rule checked in,
// since the Gemini extension reads it straight from the repo.
//
// Usage:
//   node bin/rule.js --check          validate locales and GEMINI.md sync
//   node bin/rule.js --write-gemini   regenerate GEMINI.md

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

export const LOCALES_MARKER = '<!-- PROMPTCITE:DISCLOSURE-STRINGS -->';
export const REFERENCE_LOCALE = 'en';

const GEMINI_HEADER = [
  '<!-- SPDX-License-Identifier: AGPL-3.0-only -->',
  '<!-- Copyright (c) 2026 Cam Adkins -->',
  '<!-- AUTO-GENERATED FROM src/rules/receipt.md + src/locales/. do not edit directly. -->',
  '<!-- Regenerate with: node bin/rule.js --write-gemini -->',
].join('\n');

/**
 * @typedef {object} Locale
 * @property {string} code
 * @property {string} name
 * @property {string} status
 * @property {string} file
 * @property {Map<string, string>} strings
 */

/**
 * Parse one locale file. Frontmatter carries code/name/status; each `## key`
 * heading starts a string that runs until the next heading. Lines starting
 * with `>` are translator notes and are dropped.
 *
 * @param {string} text
 * @param {string} file
 * @returns {Locale}
 */
export function parseLocale(text, file) {
  const front = text.match(/^---\n([\s\S]*?)\n---$/m);
  if (!front) throw new Error(`${file}: missing frontmatter (code, name, status)`);
  /** @type {Record<string, string>} */
  const meta = {};
  for (const line of (front[1] ?? '').split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m && m[1]) meta[m[1]] = (m[2] ?? '').trim();
  }
  const { code, name, status } = meta;
  if (!code || !name || !status) {
    throw new Error(`${file}: frontmatter needs code, name, and status`);
  }

  /** @type {Map<string, string>} */
  const strings = new Map();
  const sections = text.slice((front.index ?? 0) + front[0].length).split(/^## /m).slice(1);
  for (const section of sections) {
    const newline = section.indexOf('\n');
    const key = (newline === -1 ? section : section.slice(0, newline)).trim();
    const body = (newline === -1 ? '' : section.slice(newline + 1))
      .split('\n')
      .filter((line) => !line.startsWith('>'))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (strings.has(key)) throw new Error(`${file}: key "${key}" appears twice`);
    strings.set(key, body);
  }
  return { code, name, status, file, strings };
}

/**
 * @param {string} value
 * @returns {string[]}
 */
function placeholders(value) {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
}

/**
 * Check every locale against the reference. Returns a list of problems in
 * plain words a first-time contributor can act on; empty means valid.
 *
 * @param {Locale[]} locales
 * @returns {string[]}
 */
export function validateLocales(locales) {
  const problems = [];
  const ref = locales.find((l) => l.code === REFERENCE_LOCALE);
  if (!ref) return [`no ${REFERENCE_LOCALE}.md reference locale found`];

  const seen = new Set();
  for (const locale of locales) {
    const where = locale.file;
    if (seen.has(locale.code)) problems.push(`${where}: code "${locale.code}" is already used by another file`);
    seen.add(locale.code);
    if (`${locale.code}.md` !== locale.file.split('/').pop()) {
      problems.push(`${where}: file name should be ${locale.code}.md to match its code`);
    }
    if (!/^[a-z]{2,3}(-[A-Z]{2})?$/.test(locale.code)) {
      problems.push(`${where}: code "${locale.code}" should look like "es" or "pt-BR"`);
    }
    for (const [key, value] of ref.strings) {
      const theirs = locale.strings.get(key);
      if (theirs === undefined) {
        problems.push(`${where}: missing "## ${key}"`);
        continue;
      }
      if (theirs === '') problems.push(`${where}: "## ${key}" has no text under it`);
      const want = placeholders(value).join(', ');
      const got = placeholders(theirs).join(', ');
      if (want !== got) {
        problems.push(`${where}: "## ${key}" needs placeholders {${want}} but has {${got}}. Keep them exactly as in en.md.`);
      }
    }
    for (const key of locale.strings.keys()) {
      if (!ref.strings.has(key)) problems.push(`${where}: "## ${key}" is not a key in en.md`);
    }
  }
  return problems;
}

/**
 * @param {string} repoRoot
 * @returns {Promise<Locale[]>}
 */
export async function loadLocales(repoRoot) {
  const dir = join(repoRoot, 'src', 'locales');
  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .sort((a, b) => (a === `${REFERENCE_LOCALE}.md` ? -1 : b === `${REFERENCE_LOCALE}.md` ? 1 : a.localeCompare(b)));
  return Promise.all(files.map(async (f) => parseLocale(await readFile(join(dir, f), 'utf8'), `src/locales/${f}`)));
}

/**
 * Render every locale as the block that replaces the marker in the rule.
 *
 * @param {Locale[]} locales
 * @returns {string}
 */
export function renderLocales(locales) {
  const available = locales.map((l) => `\`${l.code}\``).join(', ');
  const blocks = locales.map((l) => {
    const lines = [...l.strings].map(([key, value]) => `- \`${key}\`: ${value}`);
    return `**${l.name} (\`${l.code}\`)**\n\n${lines.join('\n')}`;
  });
  return `Languages available: ${available}.\n\n${blocks.join('\n\n')}`;
}

/**
 * The rule as agents load it: receipt.md with the strings filled in.
 *
 * @param {string} repoRoot
 * @returns {Promise<string>}
 */
export async function composeRule(repoRoot) {
  const target = join(repoRoot, 'src', 'rules', 'receipt.md');
  let source;
  try {
    source = await readFile(target, 'utf8');
  } catch {
    throw new Error(`rule source missing at ${target}`);
  }
  if (!source.includes(LOCALES_MARKER)) throw new Error(`${target} is missing ${LOCALES_MARKER}`);
  const locales = await loadLocales(repoRoot);
  const problems = validateLocales(locales);
  if (problems.length) throw new Error(`invalid locale files:\n  ${problems.join('\n  ')}`);
  return source.replace(LOCALES_MARKER, renderLocales(locales));
}

/**
 * GEMINI.md contents: the composed rule minus its own SPDX lines, under the
 * generated-file header.
 *
 * @param {string} repoRoot
 * @returns {Promise<string>}
 */
export async function buildGemini(repoRoot) {
  const rule = await composeRule(repoRoot);
  const body = rule.split('\n').slice(3).join('\n');
  return `${GEMINI_HEADER}\n\n${body}`;
}

async function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const geminiPath = join(repoRoot, 'GEMINI.md');
  const arg = process.argv[2];

  if (arg === '--write-gemini') {
    await writeFile(geminiPath, await buildGemini(repoRoot), 'utf8');
    console.log('wrote GEMINI.md');
    return 0;
  }
  if (arg === '--check') {
    const problems = validateLocales(await loadLocales(repoRoot));
    if (problems.length) {
      console.error(`locale problems:\n  ${problems.join('\n  ')}`);
      return 1;
    }
    const want = await buildGemini(repoRoot);
    const have = await readFile(geminiPath, 'utf8').catch(() => '');
    if (want !== have) {
      console.error('GEMINI.md is out of date. Run: node bin/rule.js --write-gemini');
      return 1;
    }
    console.log('OK: locales valid and GEMINI.md in sync');
    return 0;
  }
  console.error('usage: node bin/rule.js --check | --write-gemini');
  return 2;
}

const invoked = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invoked) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
