#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Cam Adkins
// PromptCite receipt verifier: tamper-evident speed bump.
// Recomputes the content_hash and compares it against the stored value.

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
  const { content_hash: _ignored, ...rest } = receipt;
  const canonical = canonicalize(rest);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function printHelp() {
  console.log(`promptcite verify <receipt.json>

Verifies a PromptCite receipt's content_hash matches a fresh recomputation.

Exit codes:
  0  hash matches (receipt unmodified since emission)
  1  hash mismatch (receipt has been edited since emission)
  2  no content_hash field, or null hash (receipt is unverifiable)
  3  file not found, malformed JSON, or other user error

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
  const stored = receipt.content_hash;
  if (stored === undefined || stored === null) {
    console.log(`unverifiable: ${target} has no content_hash (agent had no code-execution tool at emission, or this is an older receipt).`);
    return 2;
  }
  if (typeof stored !== 'string' || !/^[a-f0-9]{64}$/.test(stored)) {
    console.error(`error: content_hash in ${target} is malformed (expected 64-char lowercase hex sha256)`);
    return 3;
  }
  const recomputed = computeHash(receipt);
  if (recomputed === stored) {
    console.log(`ok: ${target} content_hash matches recomputation.`);
    console.log(`     stored:     ${stored}`);
    console.log(`     recomputed: ${recomputed}`);
    return 0;
  }
  console.error(`mismatch: ${target} content_hash does NOT match recomputation.`);
  console.error(`     stored:     ${stored}`);
  console.error(`     recomputed: ${recomputed}`);
  console.error(`receipt has been edited since the agent emitted it, OR the canonical-serialization implementation differs from the spec.`);
  return 1;
}

// Only auto-run if invoked directly (not via test imports)
if (import.meta.url === `file://${process.argv[1]}`) {
  const code = await runVerify(process.argv.slice(2));
  process.exit(code);
}
