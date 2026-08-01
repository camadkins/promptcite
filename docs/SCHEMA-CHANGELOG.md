<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# Receipt Schema Changelog

The canonical version history for the PromptCite receipt format defined in
`src/schema.yaml`. Universities that adopt the receipt as a submission standard
rely on a stable, documented contract — this file is that record.

Versioning follows the schema's own migration policy: a `1.x → 1.(x+1)` bump may
**add optional fields only**; a `1.x → 2.0` bump may rename, remove, or re-type
fields. Consumers reading older receipts must handle absent optional fields
gracefully.

## 2.0

**BREAKING. Schema 1.x receipts are NOT valid 2.0 receipts.** Consumers must
branch on `schema_version` and keep the 1.x path working; `bin/verify.js` reads
both and will continue to.

**What changed and why.** `ai_use` was a single object, so a receipt could not
describe an assignment worked across several days — and the rule file told
students to run `/receipt` per session and combine by hand while the default
output path silently overwrote the previous receipt. The ordinary case ended in
under-disclosure. `ai_use` is now an ordered array of sessions. Full reasoning in
[ADR 0007](./adr/0007-multi-session-receipts.md).

**Field mapping (1.1 → 2.0):**

| 1.1 | 2.0 | Note |
|---|---|---|
| `ai_use` (object) | `ai_use` (array of objects) | Re-typed. One session = an array of one. |
| `metadata_source` | `ai_use[i].metadata_source` | Per-session; sessions can differ. |
| `outputs.citation_mla` | `ai_use[i].citations.mla` | Prefix dropped. Same for apa / chicago / ieee / harvard. |
| `appendix` | `ai_use[i].appendix` | Attaches to the session it came from. |
| `outputs.disclosure_statement` | unchanged | Still one paragraph, now covering every session. |
| `submission_hash` | unchanged | Hashes the submitted document; there is one document. |
| `content_hash` | unchanged algorithm | Same canonicalization; the input shape moved. |
| `generated_at` | unchanged field, **new meaning** | Now the receipt's last-write time, not the time of the AI use. |

Nothing was dropped. The upgrade is mechanical and lossless, and `/receipt`
performs it in place the first time a session is added to an older receipt.

`min_items: 1` on `ai_use` — a receipt with no sessions is not a receipt.

## 1.1

**Additive. Schema 1.0 receipts are valid 1.1 receipts.**

Added:
- `outputs.citation_ieee` (optional) — IEEE-formatted citation string, for
  engineering / CS coursework.
- `outputs.citation_harvard` (optional) — Harvard author-date citation string,
  for international / business courses.
- `submission_hash` (optional, top-level, nullable) — SHA-256 of the *submitted
  file's bytes*, binding a receipt to the specific document it describes.
  Independent of `content_hash` (which hashes the receipt's own fields) and never
  part of the `content_hash` input.

No fields removed, renamed, or re-typed.

## 1.0

Initial receipt format (MVP). Established the top-level shape: `schema_version`,
`generated_at`, `metadata_source`, `content_hash`, `student`, `assignment`,
`ai_use` (with the seven-value `category` enum), `outputs` (MLA/APA/Chicago
citations + disclosure paragraph), and the opt-in `appendix`.
