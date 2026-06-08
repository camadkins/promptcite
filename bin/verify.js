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
 * Validate a receipt against the schema contract (src/schema.yaml), using
 * only Node built-ins. Returns a list of human-readable problems; an empty
 * list means the receipt is well-formed. Optional fields (citation_ieee,
 * citation_harvard, submission_hash, source_verification, appendix) are not
 * required — schema 1.0 receipts remain valid.
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
    errs.push('schema_version must be a string like "1.1"');
  }
  str('generated_at', r.generated_at);
  if (r.metadata_source !== 'agent_reported' && r.metadata_source !== 'student_claimed') {
    errs.push('metadata_source must be "agent_reported" or "student_claimed"');
  }
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

  const u = r.ai_use;
  if (!u || typeof u !== 'object') {
    errs.push('ai_use must be an object');
  } else {
    str('ai_use.tool', u.tool);
    str('ai_use.model', u.model);
    str('ai_use.date', u.date);
    if (!USE_CATEGORIES.includes(u.category)) {
      errs.push(`ai_use.category must be one of: ${USE_CATEGORIES.join(', ')}`);
    }
    str('ai_use.prompt_summary', u.prompt_summary);
    if (typeof u.direct_content_used !== 'boolean') errs.push('ai_use.direct_content_used must be a boolean');
    str('ai_use.revision_statement', u.revision_statement);
    if (u.source_verification !== undefined && u.source_verification !== null && typeof u.source_verification !== 'boolean') {
      errs.push('ai_use.source_verification must be true, false, or null');
    }
  }

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
  const u = (r.ai_use && typeof r.ai_use === 'object') ? r.ai_use : {};
  const a = (r.assignment && typeof r.assignment === 'object') ? r.assignment : {};
  const lines = [];
  lines.push('--- Receipt summary ---');
  lines.push(`Student:    ${r.student ?? '(unknown)'}`);
  lines.push(`Assignment: ${a.title ?? '(unknown)'} — ${a.course ?? '?'}, ${a.instructor ?? '?'}`);
  lines.push(`AI use:     ${u.tool ?? '?'} (${u.model ?? '?'}) on ${u.date ?? '?'}, used to ${u.category ?? '?'}`);
  if (u.prompt_summary) lines.push(`Prompt:     ${u.prompt_summary}`);
  lines.push(`Provenance: ${r.metadata_source === 'agent_reported' ? 'agent-reported (the AI filled tool/model/date)' : r.metadata_source === 'student_claimed' ? 'student-claimed (the student typed tool/model/date)' : '(unknown)'}`);
  lines.push(`Hash:       ${hashStatus}${hashStatus === 'INTACT' ? ' (unchanged since the agent emitted it)' : hashStatus === 'MISMATCH' ? ' (edited since emission, or non-spec serializer)' : ' (no content_hash — unverifiable beyond self-disclosure)'}`);
  if (r.submission_hash) {
    lines.push(`Submission: bound to a file hash (${String(r.submission_hash).slice(0, 12)}…) — re-hash the submitted file to confirm it matches`);
  }
  lines.push(`Schema:     ${schemaErrors.length === 0 ? 'VALID' : `INVALID — ${schemaErrors.length} problem(s):`}`);
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
