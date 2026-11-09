<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0016 — Reflection questions: four fixed questions, one answer set per receipt, verbatim

**Status:** Accepted

## Context

Instructors who allow AI often care less about the disclosure than about
whether the student thought about their use of it. Several ask for a short
reflection with the submission: what they tried first, why they reached for
AI, what they did with it. Students write those by hand in a separate box,
and nothing ties the answers to the receipt.

The receipt already had per-session free text (`revision_statement`). A
reflection is different: it's about the whole assignment, and the useful
questions are the same every time.

## Decision

**An optional top-level `reflection` object with four fixed questions, asked
only when turned on, and stored in the student's own words.**

- **Four questions, fixed.** `tried_first`, `why_ai`, `what_changed`,
  `use_again`. Fixed keys let an instructor read a stack of receipts the same
  way. Custom questions are left for later; they'd need the question stored
  next to each answer.
- **One per receipt.** It's about the assignment, so it sits at the top
  level, not on a session. Adding a session keeps it as it was and offers
  once to update it.
- **Turned on, not on by default.** `reflection: true` in an instructor policy,
  a course file's policy, or the student's settings. Asking every student four
  more questions on every receipt would make the interview longer than the
  two minutes it promises.
- **Verbatim, skippable.** The agent never writes, rewords, or summarizes an
  answer, and never pushes for a longer one. Skipped questions are left out,
  and an empty object isn't written. Even when an instructor turns it on, the
  student can skip everything. A forced reflection is a writing prompt, and
  the receipt isn't a place to grade one.
- **Not in the disclosure.** The paragraph says what happened. The reflection
  is for the instructor who asked, so it stays in the JSON.

Additive under ADR 0003, part of 2.2.

## Consequences

A reflection is covered by `content_hash` like every other field, so editing
an answer after the fact shows up as a mismatch.

Nothing reads the answers. There's no length check past the 1000-character
cap, no scoring, and no "this answer seems short." Whatever a reader makes of
"I was stuck" is up to the reader.
