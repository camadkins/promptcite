#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins
// PromptCite receipt verifier: tamper-evident speed bump.
// Recomputes the content_hash and compares it against the stored value,
// validates the receipt against the schema, and prints a plain-English
// report an instructor can read without knowing the JSON shape.

import { readFile, readdir, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

/**
 * Canonical JSON serialization: sorted keys, no whitespace, UTF-8.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalize).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((k) => {
    const v = /** @type {Record<string, unknown>} */ (value)[k];
    return JSON.stringify(k) + ':' + canonicalize(v);
  });
  return '{' + entries.join(',') + '}';
}

/**
 * @param {Record<string, unknown>} receipt
 * @returns {string} hex-encoded sha256
 */
export function computeHash(receipt) {
  // content_hash and submission_hash are BOTH excluded from the canonical
  // input: content_hash is the field we're computing, and submission_hash
  // hashes an external file, not the receipt's own metadata.
  const { content_hash: _h, submission_hash: _s, ...rest } = receipt;
  const canonical = canonicalize(rest);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * True for a real calendar date written YYYY-MM-DD ("2026-02-30" is not one).
 * @param {unknown} v
 * @returns {boolean}
 */
function isIsoDate(v) {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/**
 * True for an ISO 8601 date-time: a real date, `T`, hh:mm with optional
 * seconds and fraction, and an optional Z or +hh:mm offset.
 * @param {unknown} v
 * @returns {boolean}
 */
function isIsoDateTime(v) {
  if (typeof v !== 'string') return false;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(v);
  if (!m || !isIsoDate(m[1])) return false;
  return Number(m[2]) < 24 && Number(m[3]) < 60 && (m[4] === undefined || Number(m[4]) < 60);
}

const USE_CATEGORIES = ['brainstorm', 'outline', 'draft', 'edit', 'debug', 'explain', 'search'];
// Schema 2.2. Keep in step with src/schema.yaml (tests/verify.test.js checks it).
export const STAGES = ['planning', 'researching', 'drafting', 'revising', 'checking'];
export const AI_SHARES = ['none', 'small', 'part', 'most'];
export const STUDENT_CHANGES = ['kept', 'edited', 'reworked'];
export const SHORT_MAX = 300;
/** Reflection questions (schema 2.2), in the order the interview asks them. */
export const REFLECTION_KEYS = ['tried_first', 'why_ai', 'what_changed', 'use_again'];
export const REFLECTION_MAX = 1000;
/** @type {Record<string, string>} */
const REFLECTION_LABELS = {
  tried_first: 'tried first',
  why_ai: 'why AI',
  what_changed: 'what changed',
  use_again: 'next time',
};
export const CHECK_METHODS = ['read_through', 'ran_code', 'ran_tests', 'checked_sources', 'checked_course_material', 'asked_someone', 'other'];

/** Plain words for the report. */
const SHARE_WORDS = { none: 'none', small: 'a few lines or phrases', part: 'a section or more', most: 'most of it' };
const METHOD_WORDS = {
  read_through: 'read it through', ran_code: 'ran the code', ran_tests: 'ran tests',
  checked_sources: 'checked the sources', checked_course_material: 'checked against course material',
  asked_someone: 'asked someone', other: 'other (see statement)',
};
const HEX64 = /^[a-f0-9]{64}$/;

/**
 * Check the fields that describe one AI-use session. Identical in both schema
 * versions — only where they live moved. In 1.x they sit on the single `ai_use`
 * object with `metadata_source` at the top level; in 2.0 they sit on each entry
 * of the `ai_use` array with its own `metadata_source`.
 *
 * @param {any} u the session object
 * @param {string} path where it lives, for error messages
 * @param {(p: string, v: unknown) => void} str non-empty-string checker
 * @param {string[]} errs collected problems
 * @param {boolean} sessionScopedProvenance whether metadata_source belongs here (2.0)
 */
function validateSession(u, path, str, errs, sessionScopedProvenance) {
  if (!u || typeof u !== 'object' || Array.isArray(u)) {
    errs.push(`${path} must be an object`);
    return;
  }
  str(`${path}.tool`, u.tool);
  str(`${path}.model`, u.model);
  str(`${path}.date`, u.date);
  if (!USE_CATEGORIES.includes(u.category)) {
    errs.push(`${path}.category must be one of: ${USE_CATEGORIES.join(', ')}`);
  }
  str(`${path}.prompt_summary`, u.prompt_summary);
  if (typeof u.direct_content_used !== 'boolean') {
    errs.push(`${path}.direct_content_used must be a boolean`);
  }
  str(`${path}.revision_statement`, u.revision_statement);
  if (u.source_verification !== undefined && u.source_verification !== null
      && typeof u.source_verification !== 'boolean') {
    errs.push(`${path}.source_verification must be true, false, or null`);
  }

  // Attestation (schema 2.1): optional, student-authored, never judged. Only its
  // shape is checked: a boolean `attested`, and `statement` a string when present.
  if (u.verification !== undefined) {
    const v = u.verification;
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      errs.push(`${path}.verification, when present, must be an object`);
    } else {
      if (typeof v.attested !== 'boolean') errs.push(`${path}.verification.attested must be a boolean`);
      if (v.statement !== undefined && typeof v.statement !== 'string') {
        errs.push(`${path}.verification.statement, when present, must be a string`);
      }
      // Methods (schema 2.2): picked from a list, still the student's claim.
      if (v.methods !== undefined) {
        if (!Array.isArray(v.methods) || v.methods.length === 0
            || !v.methods.every((/** @type {unknown} */ m) => typeof m === 'string' && CHECK_METHODS.includes(m))) {
          errs.push(`${path}.verification.methods, when present, must be a non-empty list drawn from: ${CHECK_METHODS.join(', ')}`);
        } else {
          if (v.attested !== true) errs.push(`${path}.verification.methods needs attested true: a method is a claim that the student checked`);
          if (v.methods.includes('other') && !(typeof v.statement === 'string' && v.statement.trim())) {
            errs.push(`${path}.verification.methods has "other", so verification.statement must say what it was`);
          }
        }
      }
    }
  }

  // Stage and extent (schema 2.2): optional, picked by the student, never
  // measured. Checked whenever present; no older emitter wrote them.
  if (u.stage !== undefined && !STAGES.includes(u.stage)) {
    errs.push(`${path}.stage, when present, must be one of: ${STAGES.join(', ')}`);
  }
  if (u.extent !== undefined) {
    const e = u.extent;
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      errs.push(`${path}.extent, when present, must be an object`);
    } else if (!AI_SHARES.includes(e.ai_share)) {
      errs.push(`${path}.extent.ai_share must be one of: ${AI_SHARES.join(', ')}`);
    } else if (e.ai_share === 'none') {
      if (e.student_change !== undefined) errs.push(`${path}.extent.student_change must be absent when ai_share is "none"`);
      if (u.direct_content_used === true) {
        errs.push(`${path}.extent.ai_share is "none" but direct_content_used is true: the two can't both be right`);
      }
    } else if (!STUDENT_CHANGES.includes(e.student_change)) {
      errs.push(`${path}.extent.student_change must be one of ${STUDENT_CHANGES.join(', ')} when ai_share is "${e.ai_share}"`);
    }
  }

  if (sessionScopedProvenance) {
    if (u.metadata_source !== 'agent_reported' && u.metadata_source !== 'student_claimed') {
      errs.push(`${path}.metadata_source must be "agent_reported" or "student_claimed"`);
    }
    const cites = u.citations;
    if (!cites || typeof cites !== 'object' || Array.isArray(cites)) {
      errs.push(`${path}.citations must be an object`);
    } else {
      str(`${path}.citations.mla`, cites.mla);
      str(`${path}.citations.apa`, cites.apa);
      str(`${path}.citations.chicago`, cites.chicago);
      for (const opt of ['ieee', 'harvard']) {
        if (cites[opt] !== undefined && (typeof cites[opt] !== 'string' || cites[opt].length === 0)) {
          errs.push(`${path}.citations.${opt}, when present, must be a non-empty string`);
        }
      }
    }
  }
}

/**
 * Date formats are enforced from schema 2.1 on. Receipts from released versions
 * (2.0 and 1.x) only get a note, so a receipt that verified yesterday still
 * verifies today (ADR 0003, additive changes only).
 * @param {Record<string, any>} r @returns {boolean}
 */
function strictFormats(r) {
  const m = /^(\d+)\.(\d+)$/.exec(String(r.schema_version ?? ''));
  return !!m && (Number(m[1]) > 2 || (Number(m[1]) === 2 && Number(m[2]) >= 1));
}

/**
 * Date and timestamp format problems, wherever the dates live in either generation.
 * @param {Record<string, any>} r @returns {string[]}
 */
function formatProblems(r) {
  const out = [];
  if (typeof r.generated_at === 'string' && r.generated_at.length > 0 && !isIsoDateTime(r.generated_at)) {
    out.push('generated_at must be an ISO 8601 timestamp (e.g. 2026-05-14T16:32:00Z)');
  }
  const sessions = Array.isArray(r.ai_use) ? r.ai_use.map((u, i) => [u, `ai_use[${i}]`])
    : r.ai_use && typeof r.ai_use === 'object' ? [[r.ai_use, 'ai_use']] : [];
  for (const [u, path] of sessions) {
    if (u && typeof u.date === 'string' && u.date.length > 0 && !isIsoDate(u.date)) {
      out.push(`${path}.date must be an ISO 8601 date (YYYY-MM-DD)`);
    }
  }
  return out;
}

/**
 * Validate a receipt against the schema contract (src/schema.yaml), using
 * only Node built-ins. Returns a list of human-readable problems; an empty
 * list means the receipt is well-formed.
 *
 * Both schema generations are accepted and validated against their own shape,
 * selected by `schema_version` rather than by sniffing the runtime type of
 * `ai_use`. An instructor holding a 1.x receipt from last term must never be
 * told it is malformed because the format moved on.
 *
 * @param {unknown} receipt
 * @returns {string[]}
 */
export function validateSchema(receipt) {
  /** @type {string[]} */
  const errs = [];
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return ['receipt is not a JSON object'];
  }
  const r = /** @type {Record<string, any>} */ (receipt);

  const str = (/** @type {string} */ path, /** @type {unknown} */ v) => {
    if (typeof v !== 'string' || v.length === 0) errs.push(`${path} must be a non-empty string`);
  };

  if (typeof r.schema_version !== 'string' || !/^\d+\.\d+$/.test(r.schema_version)) {
    errs.push('schema_version must be a string like "2.0"');
  }
  const isV2 = typeof r.schema_version === 'string' && /^2\./.test(r.schema_version);

  str('generated_at', r.generated_at);
  if (strictFormats(r)) errs.push(...formatProblems(r));
  str('student', r.student);

  if (r.content_hash !== undefined && r.content_hash !== null && (typeof r.content_hash !== 'string' || !HEX64.test(r.content_hash))) {
    errs.push('content_hash, when present, must be a 64-char lowercase hex sha256 or null');
  }
  if (r.submission_hash !== undefined && r.submission_hash !== null && (typeof r.submission_hash !== 'string' || !HEX64.test(r.submission_hash))) {
    errs.push('submission_hash, when present, must be a 64-char lowercase hex sha256 or null');
  }

  const a = r.assignment;
  if (!a || typeof a !== 'object') {
    errs.push('assignment must be an object');
  } else {
    str('assignment.course', a.course);
    str('assignment.instructor', a.instructor);
    str('assignment.title', a.title);
  }

  if (isV2) {
    if (!Array.isArray(r.ai_use)) {
      errs.push('ai_use must be an array of sessions in schema 2.0');
    } else if (r.ai_use.length === 0) {
      errs.push('ai_use must contain at least one session');
    } else {
      r.ai_use.forEach((/** @type {any} */ u, /** @type {number} */ i) => {
        validateSession(u, `ai_use[${i}]`, str, errs, true);
      });
    }

    const o = r.outputs;
    if (!o || typeof o !== 'object') {
      errs.push('outputs must be an object');
    } else {
      str('outputs.disclosure_statement', o.disclosure_statement);
      // 2.2: optional other forms of the same disclosure.
      for (const opt of ['short_statement', 'journal_statement']) {
        if (o[opt] !== undefined && (typeof o[opt] !== 'string' || o[opt].length === 0)) {
          errs.push(`outputs.${opt}, when present, must be a non-empty string`);
        }
      }
      if (typeof o.short_statement === 'string' && o.short_statement.length > SHORT_MAX) {
        errs.push(`outputs.short_statement must be at most ${SHORT_MAX} characters (it has ${o.short_statement.length})`);
      }
    }
    // 2.2: optional assignment-level reflection, the student's own words.
    if (r.reflection !== undefined) {
      const f = r.reflection;
      if (!f || typeof f !== 'object' || Array.isArray(f)) {
        errs.push('reflection, when present, must be an object');
      } else {
        const keys = Object.keys(f);
        for (const k of keys) {
          if (!REFLECTION_KEYS.includes(k)) errs.push(`reflection.${k} is not a reflection question (expected ${REFLECTION_KEYS.join(', ')})`);
          else if (typeof f[k] !== 'string' || f[k].trim().length === 0) errs.push(`reflection.${k} must be a non-empty string`);
          else if (f[k].length > REFLECTION_MAX) errs.push(`reflection.${k} must be at most ${REFLECTION_MAX} characters`);
        }
        if (keys.length === 0) errs.push('reflection, when present, needs at least one answer');
      }
    }
  } else {
    // Schema 1.x — unchanged from the original validator.
    if (r.metadata_source !== 'agent_reported' && r.metadata_source !== 'student_claimed') {
      errs.push('metadata_source must be "agent_reported" or "student_claimed"');
    }
    validateSession(r.ai_use, 'ai_use', str, errs, false);

    const o = r.outputs;
    if (!o || typeof o !== 'object') {
      errs.push('outputs must be an object');
    } else {
      str('outputs.citation_mla', o.citation_mla);
      str('outputs.citation_apa', o.citation_apa);
      str('outputs.citation_chicago', o.citation_chicago);
      str('outputs.disclosure_statement', o.disclosure_statement);
      for (const opt of ['citation_ieee', 'citation_harvard']) {
        if (o[opt] !== undefined && (typeof o[opt] !== 'string' || o[opt].length === 0)) {
          errs.push(`outputs.${opt}, when present, must be a non-empty string`);
        }
      }
    }
  }

  return errs;
}

const NOT_STATED = 'not stated';

/**
 * A student-written string for display: continuation lines are indented to sit
 * under the first, and an empty or missing value reads "not stated".
 * @param {unknown} v
 * @returns {string}
 */
function hang(v) {
  if (typeof v !== 'string' || v.trim().length === 0) return NOT_STATED;
  return v.trim().replace(/\r?\n/g, '\n            ');
}

/**
 * Which appendix kinds the student attached, by name only. The contents (a
 * share link, a transcript) are the student's to hand over and are never
 * echoed here.
 * @param {unknown} appendix
 * @returns {string}
 */
function appendixKinds(appendix) {
  if (!appendix || typeof appendix !== 'object') return 'none attached';
  const kinds = Object.keys(appendix).filter((k) => {
    const v = /** @type {Record<string, unknown>} */ (appendix)[k];
    return typeof v === 'string' && v.length > 0;
  });
  return kinds.length === 0 ? 'none attached' : `attached (${kinds.join(', ')})`;
}

/**
 * Observations that are not problems. A receipt can be valid and still worth a
 * second glance; these never affect the schema verdict or the exit code.
 *
 * Currently one: the schema asks for sessions oldest first, but a student may
 * disclose out of order (src/schema.yaml, `sessions_chronological`).
 *
 * @param {unknown} receipt
 * @returns {string[]}
 */
export function advisoryNotes(receipt) {
  /** @type {string[]} */
  const notes = [];
  const r = /** @type {Record<string, any> | null} */ (receipt);
  if (r && typeof r === 'object' && !strictFormats(r)) {
    for (const p of formatProblems(r)) notes.push(`${p} (schema ${r.schema_version ?? '?'} predates this check)`);
  }
  const sessions = r && Array.isArray(r.ai_use) ? r.ai_use : [];
  for (let i = 1; i < sessions.length; i++) {
    const prev = sessions[i - 1]?.date;
    const cur = sessions[i]?.date;
    if (isIsoDate(prev) && isIsoDate(cur) && cur < prev) {
      notes.push(`session ${i + 1} (${cur}) is dated before session ${i} (${prev}); the schema asks for oldest first`);
    }
  }
  return notes;
}

/**
 * Build a plain-English summary an instructor can read at a glance.
 * @param {Record<string, any>} receipt
 * @param {'INTACT' | 'MISMATCH' | 'UNVERIFIABLE'} hashStatus
 * @param {string[]} schemaErrors
 * @returns {string}
 */
export function formatReport(receipt, hashStatus, schemaErrors) {
  const r = receipt || {};
  const a = (r.assignment && typeof r.assignment === 'object') ? r.assignment : {};

  // Both shapes normalize to a list of sessions, so the report reads the same
  // whichever generation the receipt came from. 1.x receipts carry provenance at
  // the top level; 2.0 carries it per session.
  const sessions = Array.isArray(r.ai_use)
    ? r.ai_use
    : (r.ai_use && typeof r.ai_use === 'object')
      ? [{ ...r.ai_use, metadata_source: r.metadata_source }]
      : [];

  /** @param {unknown} src */
  const provenance = (src) => src === 'agent_reported'
    ? 'agent-reported (the AI filled tool/model/date)'
    : src === 'student_claimed'
      ? 'student-claimed (the student typed tool/model/date)'
      : '(unknown)';

  const lines = [];
  lines.push('--- Receipt summary ---');
  lines.push(`Student:    ${r.student ?? '(unknown)'}`);
  lines.push(`Assignment: ${a.title ?? '(unknown)'} — ${a.course ?? '?'}, ${a.instructor ?? '?'}`);

  if (sessions.length === 0) {
    lines.push('AI use:     (none recorded)');
  } else {
    // Sessions are listed, never totalled. A count invites reading "5 sessions"
    // as a severity score; it is not one, and the tool must not imply it is.
    sessions.forEach((/** @type {any} */ u, /** @type {number} */ i) => {
      const label = sessions.length > 1 ? `Session ${i + 1}:` : 'AI use:   ';
      lines.push(`${label}  ${u.tool ?? '?'} (${u.model ?? '?'}) on ${u.date ?? '?'}, used to ${u.category ?? '?'}`);
      if (u.prompt_summary) lines.push(`            ${u.prompt_summary}`);
      lines.push(`            provenance: ${provenance(u.metadata_source)}`);
      // What the student wrote about the work itself, as they wrote it. Unset
      // reads "not stated", never as a problem: the tool reports, the reader judges.
      lines.push(`            AI text kept verbatim: ${u.direct_content_used === true ? 'yes' : u.direct_content_used === false ? 'no' : NOT_STATED}`);
      lines.push(`            revision: ${hang(u.revision_statement)}`);
      lines.push(`            sources checked by the student: ${u.source_verification === true ? 'yes' : u.source_verification === false ? 'no' : NOT_STATED}`);
      lines.push(`            appendix: ${appendixKinds(u.appendix)}`);
      // Stage and extent (schema 2.2) print only when the student gave them.
      // Older receipts don't have them, and that is not a gap in the receipt.
      if (typeof u.stage === 'string') lines.push(`            stage: ${u.stage}`);
      const e = u.extent;
      if (e && typeof e === 'object' && typeof e.ai_share === 'string') {
        const share = /** @type {Record<string, string>} */ (SHARE_WORDS)[e.ai_share] ?? e.ai_share;
        lines.push(`            AI share of the submission: ${share}${e.student_change ? `, ${e.student_change} by the student` : ''}`);
      }
      // Attestation (schema 2.1) is what the student says they checked before
      // keeping the output. Absent on most receipts, and absence means the
      // student didn't use the feature — never that they skipped the reading.
      const v = u.verification;
      if (v && typeof v === 'object') {
        lines.push(v.attested
          ? `            verified by the student: ${v.statement || '(no detail given)'}`
          : '            the student has not marked this as verified');
        if (v.attested && Array.isArray(v.methods) && v.methods.length) {
          const words = v.methods.map((/** @type {string} */ m) => /** @type {Record<string, string>} */ (METHOD_WORDS)[m] ?? m);
          lines.push(`            how: ${words.join(', ')}`);
        }
      }
    });
  }

  for (const n of advisoryNotes(r)) lines.push(`Note:       ${n} (advisory, not a problem with the receipt)`);

  // Schema 2.x puts the paragraph under outputs too; both generations read the same.
  const o = (r.outputs && typeof r.outputs === 'object') ? r.outputs : {};
  lines.push('Disclosure paragraph (the text the student pastes into the paper):');
  lines.push(`            ${hang(o.disclosure_statement)}`);
  if (o.short_statement) lines.push(`Short form: ${hang(o.short_statement)}`);
  if (o.journal_statement) lines.push(`Journal:    ${hang(o.journal_statement)}`);
  if (r.reflection && typeof r.reflection === 'object') {
    lines.push('Reflection (the student\'s own words, for the whole assignment):');
    for (const k of REFLECTION_KEYS) {
      if (typeof r.reflection[k] === 'string') lines.push(`  ${REFLECTION_LABELS[k]}: ${r.reflection[k]}`);
    }
  }

  lines.push(`Hash:       ${hashStatus}${hashStatus === 'INTACT' ? ' (unchanged since the agent emitted it)' : hashStatus === 'MISMATCH' ? ' (edited since emission, or non-spec serializer)' : ' (no content_hash — unverifiable beyond self-disclosure)'}`);
  if (r.submission_hash) {
    lines.push(`Submission: bound to a file hash (${String(r.submission_hash).slice(0, 12)}…) — re-hash the submitted file to confirm it matches`);
  }
  lines.push(`Schema:     ${r.schema_version ?? '?'} — ${schemaErrors.length === 0 ? 'VALID' : `INVALID — ${schemaErrors.length} problem(s):`}`);
  for (const e of schemaErrors) lines.push(`              • ${e}`);
  return lines.join('\n');
}

function printHelp() {
  console.log(`promptcite verify <receipt.json> [more receipts or a directory] [options]

Verifies PromptCite receipts: recomputes the content_hash, validates each
receipt against the schema, and prints a plain-English summary of what the
student disclosed.

One file prints the full report. Several files, or a directory (its *.json
files, not recursive), print one status line per file:
  INTACT | MISMATCH | UNVERIFIABLE | INVALID | ERROR
The tool reports; it does not count, score, rank, or total anything.

Options:
  --submission <file>  hash <file> (SHA-256) and compare it to the receipt's
                       submission_hash: MATCH, DIFFERENT, or "receipt has no
                       submission_hash". One receipt only.
  --details            in batch mode, follow each status line with the full report
  -h, --help           this text

Exit codes (a batch exits with the most severe, in the order listed here):
  0  hash matches AND schema valid (receipt unmodified and well-formed)
  1  hash mismatch (receipt has been edited since emission)
  2  no content_hash field, or null hash (receipt is unverifiable)
  3  file not found, malformed JSON, or other user error
  4  hash matches but the receipt fails schema validation
  5  --submission file does not match the receipt's submission_hash
  Severity, most to least: 3, 1, 5, 4, 2, 0. A receipt with no
  submission_hash does not change the exit code.

Honest framing: this is tamper-evident, not tamper-proof. A determined
forger can recompute the hash after editing. The check matters because
casual editing won't bother.`);
}

/** Exit codes, most severe first. A batch exits with the first one present. */
const SEVERITY = [3, 1, 5, 4, 2, 0];

/**
 * @param {number[]} codes
 * @returns {number} the most severe of the codes (0 for none)
 */
export function worstCode(codes) {
  for (const c of SEVERITY) if (codes.includes(c)) return c;
  return 0;
}

/**
 * @typedef {{ err: boolean, text: string }} OutLine
 * @typedef {{ status: 'INTACT' | 'MISMATCH' | 'UNVERIFIABLE' | 'INVALID' | 'ERROR', code: number, out: OutLine[], reason?: string }} Inspection
 */

/**
 * Compare a submission file's bytes to the receipt's submission_hash.
 * @param {Record<string, any>} receipt
 * @param {string} path the submission file, for messages
 * @param {Buffer} bytes
 * @returns {{ code: number, out: OutLine[] }}
 */
function checkSubmission(receipt, path, bytes) {
  const stored = receipt.submission_hash;
  if (stored === undefined || stored === null) {
    return { code: 0, out: [{ err: false, text: 'Submission file: receipt has no submission_hash (nothing to compare against)' }] };
  }
  if (typeof stored !== 'string' || !HEX64.test(stored)) {
    return { code: 0, out: [{ err: false, text: 'Submission file: not compared, the receipt\'s submission_hash is malformed' }] };
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual === stored) {
    return { code: 0, out: [{ err: false, text: `Submission file: MATCH, ${path} hashes to the receipt's submission_hash` }] };
  }
  return {
    code: 5,
    out: [
      { err: true, text: `Submission file: DIFFERENT, ${path} does not hash to the receipt's submission_hash` },
      { err: true, text: `     receipt: ${stored}` },
      { err: true, text: `     file:    ${actual}` },
      { err: true, text: '     Either this is not the file the receipt was bound to, or it changed after the receipt was written. The tool cannot say which.' },
    ],
  };
}

/**
 * Verify one receipt file. Pure with respect to the console: everything it
 * would print comes back in `out`, so single-file and batch modes share it.
 * @param {string} target
 * @param {{ path: string, bytes: Buffer } | null} submission
 * @returns {Promise<Inspection>}
 */
async function inspectReceipt(target, submission) {
  /** @param {string} reason @returns {Inspection} */
  const fail = (reason) => ({ status: 'ERROR', code: 3, reason, out: [{ err: true, text: `error: ${reason}` }] });

  let raw;
  try {
    raw = await readFile(target, 'utf8');
  } catch (e) {
    return fail(`cannot read ${target}`);
  }
  let receipt;
  try {
    receipt = JSON.parse(raw);
  } catch (e) {
    return fail(`${target} is not valid JSON`);
  }
  if (!receipt || typeof receipt !== 'object') {
    return fail(`${target} does not contain a JSON object`);
  }

  const schemaErrors = validateSchema(receipt);
  const stored = receipt.content_hash;
  /** @type {OutLine[]} */
  const out = [];
  const say = (/** @type {string} */ text) => out.push({ err: false, text });
  const warn = (/** @type {string} */ text) => out.push({ err: true, text });
  const sub = submission ? checkSubmission(receipt, submission.path, submission.bytes) : null;

  if (stored === undefined || stored === null) {
    say(`unverifiable: ${target} has no content_hash (agent had no code-execution tool at emission, or this is an older receipt).`);
    say('');
    say(formatReport(receipt, 'UNVERIFIABLE', schemaErrors));
    if (sub) out.push(...sub.out);
    return { status: 'UNVERIFIABLE', code: worstCode([2, sub ? sub.code : 0]), out };
  }
  if (typeof stored !== 'string' || !HEX64.test(stored)) {
    return fail(`content_hash in ${target} is malformed (expected 64-char lowercase hex sha256)`);
  }
  const recomputed = computeHash(receipt);
  if (recomputed === stored) {
    say(`ok: ${target} content_hash matches recomputation.`);
    say(`     stored:     ${stored}`);
    say(`     recomputed: ${recomputed}`);
    say('');
    say(formatReport(receipt, 'INTACT', schemaErrors));
    if (sub) out.push(...sub.out);
    if (schemaErrors.length > 0) {
      warn(`\nnote: hash is intact but the receipt does not conform to the schema (${schemaErrors.length} problem(s)).`);
    }
    return {
      status: schemaErrors.length > 0 ? 'INVALID' : 'INTACT',
      code: worstCode([schemaErrors.length > 0 ? 4 : 0, sub ? sub.code : 0]),
      out,
    };
  }
  warn(`mismatch: ${target} content_hash does NOT match recomputation.`);
  warn(`     stored:     ${stored}`);
  warn(`     recomputed: ${recomputed}`);
  warn('receipt has been edited since the agent emitted it, OR the canonical-serialization implementation differs from the spec.');
  warn('');
  warn(formatReport(receipt, 'MISMATCH', schemaErrors));
  if (sub) out.push(...sub.out);
  return { status: 'MISMATCH', code: worstCode([1, sub ? sub.code : 0]), out };
}

/** @param {OutLine[]} lines @param {boolean} allToStdout */
function emit(lines, allToStdout) {
  for (const l of lines) (l.err && !allToStdout ? console.error : console.log)(l.text);
}

/**
 * @param {string[]} argv
 * @returns {{ files: string[], details: boolean, help: boolean, submission: string | null, problem: string | null }}
 */
function parseArgs(argv) {
  /** @type {string[]} */
  const files = [];
  let details = false;
  let help = false;
  /** @type {string | null} */
  let submission = null;
  /** @type {string | null} */
  let problem = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '-h' || a === '--help') help = true;
    else if (a === '--details') details = true;
    else if (a === '--submission') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('-')) problem = '--submission needs a file to hash';
      else { submission = v; i++; }
    } else if (a.startsWith('--submission=')) {
      submission = a.slice('--submission='.length);
      if (!submission) problem = '--submission needs a file to hash';
    } else if (!a.startsWith('-')) files.push(a);
    // Other flags are ignored, as they always have been.
  }
  return { files, details, help, submission, problem };
}

/**
 * Expand the arguments to receipt paths. A directory contributes its *.json
 * files, sorted, one level deep.
 * @param {string[]} args
 * @returns {Promise<{ targets: { path: string, note?: string }[], batch: boolean }>}
 */
async function expandTargets(args) {
  /** @type {{ path: string, note?: string }[]} */
  const targets = [];
  let batch = args.length > 1;
  for (const arg of args) {
    let isDir = false;
    try { isDir = (await stat(arg)).isDirectory(); } catch { /* inspectReceipt reports it */ }
    if (!isDir) { targets.push({ path: arg }); continue; }
    batch = true;
    const names = (await readdir(arg)).filter((n) => n.endsWith('.json')).sort();
    /** @type {string[]} */
    const found = [];
    for (const n of names) {
      const full = join(arg, n);
      try { if ((await stat(full)).isFile()) found.push(full); } catch { /* skip */ }
    }
    if (found.length === 0) targets.push({ path: arg, note: `${arg} has no .json files` });
    for (const f of found) targets.push({ path: f });
  }
  return { targets, batch };
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function runVerify(argv) {
  const opts = parseArgs(argv);
  if (opts.help || opts.files.length === 0) {
    printHelp();
    return 0;
  }
  if (opts.problem) {
    console.error(`error: ${opts.problem}`);
    return 3;
  }

  const { targets, batch } = await expandTargets(opts.files);

  /** @type {{ path: string, bytes: Buffer } | null} */
  let submission = null;
  if (opts.submission !== null) {
    if (batch) {
      console.error('error: --submission checks one file against one receipt; give it a single receipt, not several or a directory');
      return 3;
    }
    try {
      submission = { path: opts.submission, bytes: await readFile(opts.submission) };
    } catch {
      console.error(`error: cannot read ${opts.submission}`);
      return 3;
    }
  }

  if (!batch) {
    const only = targets[0];
    if (!only) return 3;
    const res = await inspectReceipt(only.path, submission);
    emit(res.out, false);
    return res.code;
  }

  // Batch: one status line per file, in order. Full reports only on request.
  // Nothing is totalled across files; the exit code is the single summary.
  /** @type {number[]} */
  const codes = [];
  for (const t of targets) {
    if (t.note) {
      console.log(`${'ERROR'.padEnd(12)} ${t.path} (${t.note})`);
      codes.push(3);
      continue;
    }
    const res = await inspectReceipt(t.path, null);
    codes.push(res.code);
    const why = res.status === 'ERROR' ? ` (${res.reason})` : '';
    console.log(`${res.status.padEnd(12)} ${t.path}${why}`);
    if (opts.details && res.status !== 'ERROR') {
      console.log('');
      emit(res.out, true);
      console.log('');
    }
  }
  return worstCode(codes);
}

/**
 * True when this file is the program being run, rather than a module someone
 * imported (the tests import it).
 *
 * The realpath comparison is load-bearing, not defensive style. npm installs a
 * bin as a SYMLINK — `node_modules/.bin/promptcite-verify` points at
 * `../promptcite/bin/verify.js`. Node reports the symlink in `process.argv[1]`
 * but resolves `import.meta.url` to the real file, so comparing them directly
 * never matches once the package is installed. The CLI then does nothing and
 * exits 0, which looks exactly like success.
 *
 * @param {string} metaUrl the caller's import.meta.url
 */
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
  const code = await runVerify(process.argv.slice(2));
  process.exit(code);
}
