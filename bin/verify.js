#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins
// PromptCite receipt verifier: tamper-evident speed bump.
// Recomputes the content_hash and compares it against the stored value,
// validates the receipt against the schema, and prints a plain-English
// report an instructor can read without knowing the JSON shape.

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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

const USE_CATEGORIES = ['brainstorm', 'outline', 'draft', 'edit', 'debug', 'explain', 'search'];
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
    });
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
  console.log(`promptcite verify <receipt.json>

Verifies a PromptCite receipt: recomputes the content_hash, validates the
receipt against the schema, and prints a plain-English summary.

Exit codes:
  0  hash matches AND schema valid (receipt unmodified and well-formed)
  1  hash mismatch (receipt has been edited since emission)
  2  no content_hash field, or null hash (receipt is unverifiable)
  3  file not found, malformed JSON, or other user error
  4  hash matches but the receipt fails schema validation

Honest framing: this is tamper-evident, not tamper-proof. A determined
forger can recompute the hash after editing. The check matters because
casual editing won't bother.`);
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function runVerify(argv) {
  const args = argv.filter((/** @type {string} */ a) => !a.startsWith('-'));
  if (argv.includes('-h') || argv.includes('--help') || args.length === 0) {
    printHelp();
    return 0;
  }
  const target = args[0];
  if (!target) {
    printHelp();
    return 0;
  }
  let raw;
  try {
    raw = await readFile(target, 'utf8');
  } catch (e) {
    console.error(`error: cannot read ${target}`);
    return 3;
  }
  let receipt;
  try {
    receipt = JSON.parse(raw);
  } catch (e) {
    console.error(`error: ${target} is not valid JSON`);
    return 3;
  }
  if (!receipt || typeof receipt !== 'object') {
    console.error(`error: ${target} does not contain a JSON object`);
    return 3;
  }

  const schemaErrors = validateSchema(receipt);
  const stored = receipt.content_hash;

  if (stored === undefined || stored === null) {
    console.log(`unverifiable: ${target} has no content_hash (agent had no code-execution tool at emission, or this is an older receipt).`);
    console.log('');
    console.log(formatReport(receipt, 'UNVERIFIABLE', schemaErrors));
    return 2;
  }
  if (typeof stored !== 'string' || !HEX64.test(stored)) {
    console.error(`error: content_hash in ${target} is malformed (expected 64-char lowercase hex sha256)`);
    return 3;
  }
  const recomputed = computeHash(receipt);
  if (recomputed === stored) {
    console.log(`ok: ${target} content_hash matches recomputation.`);
    console.log(`     stored:     ${stored}`);
    console.log(`     recomputed: ${recomputed}`);
    console.log('');
    console.log(formatReport(receipt, 'INTACT', schemaErrors));
    if (schemaErrors.length > 0) {
      console.error(`\nnote: hash is intact but the receipt does not conform to the schema (${schemaErrors.length} problem(s)).`);
      return 4;
    }
    return 0;
  }
  console.error(`mismatch: ${target} content_hash does NOT match recomputation.`);
  console.error(`     stored:     ${stored}`);
  console.error(`     recomputed: ${recomputed}`);
  console.error(`receipt has been edited since the agent emitted it, OR the canonical-serialization implementation differs from the spec.`);
  console.error('');
  console.error(formatReport(receipt, 'MISMATCH', schemaErrors));
  return 1;
}

// Only auto-run if invoked directly (not via test imports)
if (import.meta.url === `file://${process.argv[1]}`) {
  const code = await runVerify(process.argv.slice(2));
  process.exit(code);
}
