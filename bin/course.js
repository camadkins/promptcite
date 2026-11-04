// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins
//
// Course files: what one class's syllabus says about AI use, kept by the
// student at ~/.promptcite/courses/<id>.json. See ADR 0009.
//
// This module only reads, checks, and lists them. Writing a course file is
// the /receipt `course add` flow's job, on the student's explicit yes, and
// binding a folder to one is `promptcite course use`. Nothing here leaves the
// machine and nothing here is ever written into a receipt.

import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

/**
 * @typedef {Object} CourseCheck
 * @property {string[]} errors    Reasons the file can't be used. Non-empty means invalid.
 * @property {string[]} warnings  Things worth a look that don't stop it working.
 */

/**
 * @typedef {Object} CourseEntry
 * @property {string} id         The id the file name claims (`<id>.json`).
 * @property {string} file       Absolute path to the file.
 * @property {any} course        Parsed contents, or null when it wouldn't parse.
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/** Use categories, matching src/schema.yaml. */
export const CATEGORIES = ['brainstorm', 'outline', 'draft', 'edit', 'debug', 'explain', 'search'];
export const PROFILES = ['code', 'essay', 'lab-report', 'math-proof', 'studio'];
export const CITATION_STYLES = ['MLA', 'APA', 'Chicago', 'IEEE', 'Harvard'];
export const APPENDICES = ['share_link_or_excerpt', 'full_transcript', 'diff_or_test_log'];

/**
 * Policy keys a course file may carry. The same keys as promptcite.policy.json
 * minus the three below, which stay assignment-only.
 */
export const COURSE_POLICY_KEYS = [
  'profile',
  'allowed_categories',
  'required_citation_style',
  'disclosure_language',
  'require_source_verification',
  'required_appendix',
];

/**
 * Policy keys that only an assignment's promptcite.policy.json may set. The
 * hook reads that file and nothing else, so a course file claiming to switch
 * recording on would be a promise the tool doesn't keep.
 */
export const ASSIGNMENT_ONLY_KEYS = ['require_ledger', 'require_markers', 'require_attestation'];

const TOP_LEVEL_KEYS = ['id', 'name', 'aliases', 'term', 'instructor', 'policy', 'guidance', 'unclear', 'source'];

/**
 * Lowercase letters, digits, and single dashes; starts and ends alphanumeric.
 * No dots and no slashes, so an id can never walk out of the courses folder.
 */
const ID_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/;

/** @param {unknown} id @returns {id is string} */
export function isSafeCourseId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

/**
 * Where course files live. Same home-directory resolution as the ledger
 * (resolveLedgerPath in bin/hook.js), so a sandboxed HOME moves both.
 *
 * @param {string} [home]
 */
export function resolveCoursesDir(home = homedir()) {
  return join(home, '.promptcite', 'courses');
}

/**
 * Path for a course id, or null when the id isn't safe to put in a path.
 *
 * @param {string} id
 * @param {string} [home]
 * @returns {string | null}
 */
export function coursePath(id, home) {
  if (!isSafeCourseId(id)) return null;
  return join(resolveCoursesDir(home), `${id}.json`);
}

/** @param {unknown} v @returns {v is Record<string, any>} */
function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** @param {unknown} v @returns {v is string} */
function isText(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** @param {unknown} v @returns {v is string[]} */
function isTextList(v) {
  return Array.isArray(v) && v.every(isText);
}

/** @param {unknown} v */
function isIsoDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return false;
  return !Number.isNaN(Date.parse(v));
}

/**
 * @param {unknown} policy
 * @param {string[]} errors
 */
function checkPolicy(policy, errors) {
  if (!isObject(policy)) {
    errors.push('policy must be an object');
    return;
  }
  for (const [key, value] of Object.entries(policy)) {
    if (key === '_comment') continue;
    if (ASSIGNMENT_ONLY_KEYS.includes(key)) {
      errors.push(`policy.${key} is assignment-only: it belongs in that assignment's promptcite.policy.json, which is the only file the hook reads`);
      continue;
    }
    if (!COURSE_POLICY_KEYS.includes(key)) {
      errors.push(`policy.${key} is not a policy key (allowed: ${COURSE_POLICY_KEYS.join(', ')})`);
      continue;
    }
    switch (key) {
      case 'profile':
        if (!PROFILES.includes(value)) errors.push(`policy.profile must be one of ${PROFILES.join(', ')}`);
        break;
      case 'required_citation_style':
        if (!CITATION_STYLES.includes(value)) errors.push(`policy.required_citation_style must be one of ${CITATION_STYLES.join(', ')}`);
        break;
      case 'disclosure_language':
        if (!isText(value)) errors.push('policy.disclosure_language must be a language code such as "en"');
        break;
      case 'allowed_categories':
      case 'require_source_verification':
        if (!Array.isArray(value) || !value.every((c) => CATEGORIES.includes(c))) {
          errors.push(`policy.${key} must be a list drawn from ${CATEGORIES.join(', ')}`);
        }
        break;
      case 'required_appendix':
        if (!isObject(value)) {
          errors.push('policy.required_appendix must be an object of category → appendix');
          break;
        }
        for (const [cat, appendix] of Object.entries(value)) {
          if (!CATEGORIES.includes(cat)) errors.push(`policy.required_appendix.${cat} is not a use category`);
          else if (!APPENDICES.includes(appendix)) errors.push(`policy.required_appendix.${cat} must be one of ${APPENDICES.join(', ')}`);
        }
        break;
    }
  }
}

/**
 * Check a parsed course file. Deterministic and side-effect free.
 *
 * The rule that matters most: every guidance line carries the syllabus's own
 * words in `quote`. A rule with no quote is a paraphrase nobody can check, and
 * a paraphrase is how "ask first" turns into "allowed".
 *
 * @param {unknown} course
 * @returns {CourseCheck}
 */
export function validateCourse(course) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];

  if (!isObject(course)) {
    return { errors: ['a course file must be a JSON object'], warnings };
  }

  if (!isText(course.id)) errors.push('id is required');
  else if (!isSafeCourseId(course.id)) {
    errors.push(`id "${course.id}" is not a safe course id: use lowercase letters, digits, and dashes, like "csce-423"`);
  }
  if (!isText(course.name)) errors.push('name is required, like "CSCE 423"');

  if (course.aliases !== undefined && !isTextList(course.aliases)) {
    errors.push('aliases must be a list of non-empty strings');
  }
  for (const key of ['term', 'instructor']) {
    if (course[key] !== undefined && typeof course[key] !== 'string') errors.push(`${key} must be a string`);
  }

  if (course.policy !== undefined) checkPolicy(course.policy, errors);

  if (course.guidance !== undefined) {
    if (!Array.isArray(course.guidance)) {
      errors.push('guidance must be a list');
    } else {
      course.guidance.forEach((/** @type {unknown} */ g, /** @type {number} */ i) => {
        if (!isObject(g)) {
          errors.push(`guidance[${i}] must be an object with rule and quote`);
          return;
        }
        if (!isText(g.rule)) errors.push(`guidance[${i}] has no rule`);
        if (!isText(g.quote)) errors.push(`guidance[${i}] has no quote: every rule needs the syllabus's own words`);
        if (g.where !== undefined && typeof g.where !== 'string') errors.push(`guidance[${i}].where must be a string`);
      });
    }
  }

  if (course.unclear !== undefined) {
    if (!Array.isArray(course.unclear)) {
      errors.push('unclear must be a list');
    } else {
      course.unclear.forEach((/** @type {unknown} */ u, /** @type {number} */ i) => {
        if (!isObject(u) || !isText(u.topic)) errors.push(`unclear[${i}] needs a topic`);
        else if (u.quote !== undefined && typeof u.quote !== 'string') errors.push(`unclear[${i}].quote must be a string`);
      });
    }
  }

  if (course.source !== undefined) {
    if (!isObject(course.source)) {
      errors.push('source must be an object with file and added');
    } else {
      const { file, added } = course.source;
      if (file !== undefined) {
        if (!isText(file)) errors.push('source.file must be a file name');
        else if (/[\\/]/.test(file) || file !== basename(file)) {
          errors.push('source.file must be the file name only, not a path');
        }
      }
      if (added !== undefined && !isIsoDate(added)) errors.push('source.added must be an ISO date like 2026-08-24');
    }
  }

  const hasGuidance = Array.isArray(course.guidance) && course.guidance.length > 0;
  const hasPolicy = isObject(course.policy) && Object.keys(course.policy).some((k) => k !== '_comment');
  if (!hasGuidance && !hasPolicy && errors.length === 0) {
    warnings.push('no guidance and no policy: this course file tells PromptCite nothing yet');
  }

  for (const key of Object.keys(course)) {
    if (key === '_comment' || TOP_LEVEL_KEYS.includes(key)) continue;
    warnings.push(`unknown key "${key}" is ignored`);
  }

  return { errors, warnings };
}

/**
 * Read and check one course file from disk.
 *
 * @param {string} file
 * @returns {{ course: any, errors: string[], warnings: string[] }}
 */
export function readCourseFile(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    return { course: null, errors: [code === 'ENOENT' ? `no such file: ${file}` : `can't read ${file}`], warnings: [] };
  }
  let course;
  try {
    course = JSON.parse(raw);
  } catch {
    return { course: null, errors: ['not valid JSON'], warnings: [] };
  }
  return { course, ...validateCourse(course) };
}

/**
 * Load a course by id from the courses folder. Null when the id is unsafe or
 * there is no such file. A file whose id disagrees with its name is reported
 * as an error, since `course use` and folder bindings go by the file name.
 *
 * @param {string} id
 * @param {string} [home]
 * @returns {CourseEntry | null}
 */
export function loadCourse(id, home) {
  const file = coursePath(id, home);
  if (!file) return null;
  const result = readCourseFile(file);
  if (result.course === null && result.errors[0]?.startsWith('no such file')) return null;
  if (isObject(result.course) && isText(result.course.id) && result.course.id !== id) {
    result.errors.push(`id "${result.course.id}" doesn't match the file name ${id}.json`);
  }
  return { id, file, ...result };
}

/**
 * Every course file in the courses folder, sorted by id. Files whose names
 * aren't safe ids are skipped rather than read.
 *
 * @param {string} [home]
 * @returns {CourseEntry[]}
 */
export function listCourses(home) {
  let names;
  try {
    names = readdirSync(resolveCoursesDir(home));
  } catch {
    return [];
  }
  /** @type {CourseEntry[]} */
  const entries = [];
  for (const name of names.sort()) {
    if (!name.endsWith('.json')) continue;
    const entry = loadCourse(name.slice(0, -'.json'.length), home);
    if (entry) entries.push(entry);
  }
  return entries;
}
