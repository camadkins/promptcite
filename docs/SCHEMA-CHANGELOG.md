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

## 2.1

**Additive. Every 2.0 receipt is a valid 2.1 receipt and needs no migration.**

Added one optional field, `ai_use[].verification`:

```json
"verification": {
  "attested": true,
  "statement": "Traced the base cases by hand, tested n=0 and both-empty, fixed an off-by-one in the loop bound."
}
```

`attested` is a boolean the student sets by saying so. `statement` is their own
account of what they checked, present when `attested` is true, and never written
or paraphrased by the agent.

**Why.** A receipt records that AI was used. It doesn't record that anyone read
the output. For instructors whose position is that verified output belongs to the
student who verified it, that second fact is the one they want, and 2.0 had
nowhere to put it. See ADR 0008.

**Reading a 2.1 receipt.** Nothing else changed. `verification` is absent from
most receipts, including every receipt written before this version existed, and
its absence means the student made no verification claim. It does not mean they
skipped the reading, and a receipt without it is not a lesser receipt.

**Field mapping from 2.0:** none. No field was renamed, removed, or re-typed.

**Citation descriptions updated (no version bump).** The `ai_use[].citations`
descriptions now name the current guidance each style follows: MLA's revised
generative-AI guidance (August 2025), APA's generative-AI reference formats
(September 2025), and Chicago 18th edition §14.112, with IEEE and Harvard
marked as common conventions. Only the descriptions changed. The fields, their
types, their validation, and the `content_hash` input are untouched, so every
existing receipt, including ones holding the older MLA 2023 / APA 2023 /
Chicago 17 strings, still validates and verifies.

## 2.2

**Additive. Every 2.1 receipt is a valid 2.2 receipt and needs no migration.**

Added three optional per-session fields:

```json
"stage": "drafting",
"extent": { "ai_share": "small", "student_change": "reworked" },
"verification": {
  "attested": true,
  "statement": "Checked every fact against my interview notes.",
  "methods": ["read_through", "checked_sources"]
}
```

- `stage` is where in the work the session happened: `planning`,
  `researching`, `drafting`, `revising`, or `checking`. `category` already said
  what the AI did. This says when.
- `extent.ai_share` is how much of the submission came from the AI in that
  session: `none`, `small`, `part`, or `most`. `extent.student_change` is what
  the student did with it: `kept`, `edited`, or `reworked`. It's required when
  `ai_share` isn't `none` and absent when it is.
- `verification.methods` is how the student checked, from a short list. It
  needs `attested: true`, and `other` needs a `statement`.

**Why.** Instructors asked what kind of help, at what stage, and how much of it
ended up in the work. 2.1 could answer the first. The second and third lived
only in free text, and the interview already asked drafts for a rough
percentage and had nowhere to keep it. See ADR 0012.

**Validation.** The verifier checks each field whenever it's present, plus two
cross-checks: `ai_share: "none"` with `direct_content_used: true` is a
contradiction and is invalid, and `methods` without `attested: true` is
invalid. Nothing is measured. Every value is the student's pick.

**Other forms.** 2.2 also adds two optional strings under `outputs`:
`short_statement` (one line for an LMS comment box, at most 300 characters) and
`journal_statement` (a journal's AI declaration, Elsevier's wording by
default). Each is written only when the student asks for it, covers every
session, and never replaces `disclosure_statement`. See ADR 0014.

**Reflection.** 2.2 also adds an optional top-level `reflection` object, with
the student's answers to four questions about the whole assignment:
`tried_first`, `why_ai`, `what_changed`, `use_again`. It's asked only when an
instructor policy, a course file, or the student's settings turn on
`reflection`, every answer is stored verbatim, and skipped questions are left
out. One per receipt, since it's about the assignment, not a session. See
ADR 0016.

**Sources.** 2.2 also adds an optional per-session `sources` list, `{ ref,
confirmed, how? }`, on sessions where `source_verification` applies. With a
list, `source_verification` is its summary (true only when every source is
confirmed) and the verifier rejects a mismatch. Unconfirmed sources are
named in an advisory note, not an error. See ADR 0018.

**File table.** 2.2 also adds an optional top-level `code_files` list for code:
one row per file the AI touched, with `file`, `tools`, `role` (`generated`,
`improved`, or `both`, the student's answer), and `source` (`marker`,
`ledger`, or `student`). Rows are listed from `promptcite-check --files` and
the ledger and confirmed by the student. Nothing in it is counted. See ADR
0017.

**Field mapping from 2.1:** none. No field was renamed, removed, or re-typed.
