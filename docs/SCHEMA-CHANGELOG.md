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
