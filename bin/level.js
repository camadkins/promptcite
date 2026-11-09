// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins
//
// AI levels: how much AI an assignment allows, on the AI Assessment Scale
// (AIAS, Perkins, Roe and Furze, 2024) or a scale the instructor names. See
// ADR 0011.
//
// An assignment's promptcite.policy.json or a course file says which level
// applies and quotes the rule it came from. /receipt asks this module whether
// the uses the student logged go past that level, and shows the warning before
// it writes anything. It warns. It never blocks: a student disclosing a use
// the rule doesn't allow is still writing an honest receipt.
//
// Nothing here reads files or leaves the machine, and an AI level is never
// written into a receipt.

/** Use categories, matching src/schema.yaml. bin/course.js re-exports these. */
export const CATEGORIES = ['brainstorm', 'outline', 'draft', 'edit', 'debug', 'explain', 'search'];

const PLANNING = ['brainstorm', 'outline', 'search', 'explain'];

/**
 * The AIAS, as published. `allows` is PromptCite's reading of each level in
 * terms of its seven use categories, not part of the scale itself. Levels 3
 * to 5 allow every category: what separates them is how much of the work AI
 * may produce, which a category can't show. ADR 0011 has the reasoning.
 */
export const AIAS = {
  name: 'AI Assessment Scale (AIAS)',
  levels: [
    { level: 1, label: 'No AI', allows: [] },
    { level: 2, label: 'AI Planning', allows: PLANNING },
    { level: 3, label: 'AI Collaboration', allows: CATEGORIES },
    { level: 4, label: 'Full AI', allows: CATEGORIES },
    { level: 5, label: 'AI Exploration', allows: CATEGORIES },
  ],
};

/**
 * @typedef {Object} ScaleLevel
 * @property {number | string} level
 * @property {string} label
 * @property {string[]} allows
 */

/**
 * @typedef {Object} Scale
 * @property {string} name
 * @property {ScaleLevel[]} levels
 */

/**
 * @typedef {Object} LevelCheck
 * @property {Scale} scale
 * @property {ScaleLevel} level
 * @property {string[]} over     Logged categories this level doesn't allow, in the order given.
 * @property {string | null} warning  The text to show the student, or null when nothing is over.
 */

/** @param {unknown} v @returns {v is Record<string, any>} */
function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** @param {unknown} v @returns {v is string} */
function isText(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Check an `ai_level` value and push any problems onto `errors`, each starting
 * with `path`. Shapes:
 *
 *   { "level": 2, "quote": "...", "where": "..." }                  AIAS
 *   { "scale": "aias", "level": 2, "quote": "..." }                 AIAS, said out loud
 *   { "scale": { "name": "...", "levels": [...] }, "level": "...", "quote": "..." }
 *
 * `quote` is required for the same reason a course file's guidance needs one:
 * a level with no words behind it is a paraphrase nobody can check.
 *
 * @param {unknown} value
 * @param {string} path  Where the value sits, like "policy.ai_level".
 * @param {string[]} errors
 */
export function checkAiLevel(value, path, errors) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object with level and quote`);
    return;
  }
  for (const key of Object.keys(value)) {
    if (!['_comment', 'scale', 'level', 'rule', 'quote', 'where'].includes(key)) {
      errors.push(`${path}.${key} is not an ai_level key (allowed: scale, level, rule, quote, where)`);
    }
  }
  const scale = value.scale === undefined || value.scale === 'aias' ? AIAS : value.scale;
  if (scale !== AIAS) {
    if (typeof scale === 'string') {
      errors.push(`${path}.scale must be "aias" or a custom scale object with name and levels`);
      return;
    }
    if (!checkScale(scale, `${path}.scale`, errors)) return;
  }
  if (!findLevel(/** @type {Scale} */ (scale), value.level)) {
    const names = /** @type {Scale} */ (scale).levels.map((l) => JSON.stringify(l.level)).join(', ');
    errors.push(`${path}.level must be one of ${names}`);
  }
  if (!isText(value.quote)) {
    errors.push(`${path} has no quote: the level needs the rule's own words`);
  }
  for (const key of ['rule', 'where']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') errors.push(`${path}.${key} must be a string`);
  }
}

/**
 * @param {unknown} scale
 * @param {string} path
 * @param {string[]} errors
 * @returns {boolean} true when the scale is usable.
 */
function checkScale(scale, path, errors) {
  if (!isObject(scale)) {
    errors.push(`${path} must be "aias" or an object with name and levels`);
    return false;
  }
  const before = errors.length;
  if (!isText(scale.name)) errors.push(`${path}.name is required`);
  if (!Array.isArray(scale.levels) || scale.levels.length === 0) {
    errors.push(`${path}.levels must be a non-empty list`);
    return false;
  }
  /** @type {Set<string>} */
  const seen = new Set();
  scale.levels.forEach((/** @type {unknown} */ l, /** @type {number} */ i) => {
    const at = `${path}.levels[${i}]`;
    if (!isObject(l)) {
      errors.push(`${at} must be an object with level, label, and allows`);
      return;
    }
    const id = l.level;
    if (!(typeof id === 'number' && Number.isInteger(id)) && !isText(id)) {
      errors.push(`${at}.level must be a whole number or a name`);
    } else if (seen.has(String(id).toLowerCase())) {
      errors.push(`${at}.level ${JSON.stringify(id)} appears twice`);
    } else {
      seen.add(String(id).toLowerCase());
    }
    if (!isText(l.label)) errors.push(`${at}.label is required`);
    if (!Array.isArray(l.allows) || !l.allows.every((/** @type {unknown} */ c) => typeof c === 'string' && CATEGORIES.includes(c))) {
      errors.push(`${at}.allows must be a list drawn from ${CATEGORIES.join(', ')}`);
    }
  });
  return errors.length === before;
}

/**
 * The level in a scale, matched by id. Names match ignoring case, and a number
 * written as text ("2") matches the number.
 *
 * @param {Scale} scale
 * @param {unknown} id
 * @returns {ScaleLevel | null}
 */
function findLevel(scale, id) {
  if (!(typeof id === 'number' || typeof id === 'string')) return null;
  const want = String(id).trim().toLowerCase();
  return scale.levels.find((l) => String(l.level).toLowerCase() === want) ?? null;
}

/**
 * Normalize a name for matching: lowercase, no spaces, dashes, or underscores.
 * Same rule the /receipt course matching uses.
 *
 * @param {string} s
 */
function squash(s) {
  return s.toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * The course-file assignment a student's words name, or null. Matches `name`
 * and `aliases`, ignoring case, spaces, and dashes. More than one match is
 * returned as all of them so the caller can ask which.
 *
 * @param {any} course  A parsed course file.
 * @param {string} said
 * @returns {any[]}
 */
export function matchAssignments(course, said) {
  if (!isObject(course) || !Array.isArray(course.assignments) || !isText(said)) return [];
  const want = squash(said);
  return course.assignments.filter((/** @type {any} */ a) => {
    if (!isObject(a)) return false;
    const names = [a.name, ...(Array.isArray(a.aliases) ? a.aliases : [])].filter(isText);
    return names.some((n) => squash(n) === want);
  });
}

/**
 * Which `ai_level` applies, highest first: the assignment's
 * promptcite.policy.json, then the course file's matching assignment, then the
 * course file's own policy. Same precedence as every other policy key.
 *
 * @param {{ policy?: any, course?: any, assignment?: any }} sources
 *   `assignment` is one entry from `matchAssignments`, already confirmed.
 * @returns {{ aiLevel: any, from: 'assignment policy' | 'course assignment' | 'course policy' } | null}
 */
export function resolveAiLevel({ policy, course, assignment } = {}) {
  if (isObject(policy) && policy.ai_level !== undefined) return { aiLevel: policy.ai_level, from: 'assignment policy' };
  if (isObject(assignment) && assignment.ai_level !== undefined) return { aiLevel: assignment.ai_level, from: 'course assignment' };
  if (isObject(course) && isObject(course.policy) && course.policy.ai_level !== undefined) {
    return { aiLevel: course.policy.ai_level, from: 'course policy' };
  }
  return null;
}

/**
 * Compare the logged use categories against an `ai_level`. Throws on an
 * invalid level, since a caller should have checked it first.
 *
 * @param {any} aiLevel
 * @param {string[]} categories  Every category logged across the receipt's sessions.
 * @returns {LevelCheck}
 */
export function checkUses(aiLevel, categories) {
  /** @type {string[]} */
  const errors = [];
  checkAiLevel(aiLevel, 'ai_level', errors);
  if (errors.length) throw new Error(errors.join('; '));
  /** @type {Scale} */
  const scale = aiLevel.scale === undefined || aiLevel.scale === 'aias' ? AIAS : aiLevel.scale;
  const level = /** @type {ScaleLevel} */ (findLevel(scale, aiLevel.level));
  const over = [...new Set(categories)].filter((c) => !level.allows.includes(c));
  return { scale, level, over, warning: over.length ? formatWarning(scale, level, over, aiLevel) : null };
}

/**
 * The warning a student sees. Says which level, which uses go past it, and the
 * rule in its own words, then says to disclose anyway.
 *
 * @param {Scale} scale
 * @param {ScaleLevel} level
 * @param {string[]} over
 * @param {any} aiLevel
 */
function formatWarning(scale, level, over, aiLevel) {
  const where = isText(aiLevel.where) ? ` (${aiLevel.where})` : '';
  const allowed = level.allows.length ? `it allows ${level.allows.join(', ')}` : 'it allows no AI use';
  const uses = over.length === 1 ? `"${over[0]}" goes` : `${over.map((c) => `"${c}"`).join(', ')} go`;
  return [
    `This assignment is ${scale.name} level ${level.level}, ${level.label}: ${allowed}.`,
    `Your logged use ${uses} past that.`,
    `The rule: "${aiLevel.quote.trim()}"${where}`,
    'Disclose it anyway. An honest receipt is still the right one, and your instructor decides what it means.',
  ].join('\n');
}

/**
 * One line naming the level and what it allows, for `policy check` with no
 * categories and for the interview's opening line.
 *
 * @param {any} aiLevel  A valid ai_level.
 */
export function describeLevel(aiLevel) {
  const { scale, level } = checkUses(aiLevel, []);
  const allowed = level.allows.length ? level.allows.join(', ') : 'no AI use';
  return `${scale.name} level ${level.level}, ${level.label} (allows ${allowed})`;
}
