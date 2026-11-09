<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0012 — Stage and extent: closed lists the student picks from

**Status:** Accepted
**Relates to:** [ADR 0003](./0003-additive-schema-version-policy.md), [ADR 0008](./0008-attestation-over-provenance.md), [ADR 0011](./0011-ai-levels-warn-never-gate.md)

## Context

A receipt said what the AI was used for (`category`), whether any of its text
was kept word for word (`direct_content_used`), and what the student changed
(`revision_statement`, free text). It didn't say when in the work it happened
or how much of the submission came from it. Those are the two things
instructors ask about most, and the interview already asked drafts for a
rough percentage that went nowhere.

ADR 0011 also left a gap: on AIAS, levels 3 to 5 all allow every category, so
a category check can't tell them apart. How much AI produced is what separates
them.

## Decision

**Add `stage`, `extent`, and `verification.methods` to each session, all
optional, all closed lists the student picks from. Schema 2.2.**

- **Closed lists, not free text.** An instructor reading thirty receipts can
  compare "part, reworked" across them. Thirty different sentences can't be
  compared. The student's own words still go in `revision_statement` and
  `verification.statement`.
- **One stage list for every discipline.** Code and writing word it
  differently in the interview ("building" is `drafting`, "testing" is
  `checking`) but store the same five values, so a course with both kinds of
  work reads the same.
- **Four coarse shares, not a percentage.** Nobody knows they used 30% AI.
  They do know whether it was none, a few lines, a section, or most of it.
- **Picked, never measured.** PromptCite doesn't compare the receipt to the
  work and won't start. The verifier only checks that the picks are from the
  list and don't contradict each other.
- **Additive, 2.2.** 2.1 hasn't shipped in a tagged release, but anyone
  installing from main has been writing 2.1 receipts, so this gets its own
  version under ADR 0003 instead of quietly changing 2.1.

## Consequences

A receipt can now say "drafting, a small part, reworked, checked against my
notes" in a form an instructor can scan. Every older receipt still validates
unchanged.

The values are only as honest as the student. That's the same trust model as
every other field: a receipt is a disclosure, not evidence.

The AI-level check from ADR 0011 still uses categories only. Using `extent` to
tell levels 3 to 5 apart is possible now, but deciding what share each level
allows is a reading of the scale we haven't made, and it isn't part of this
change.
