<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0017 — File table for code: markers say where, the student says what

**Status:** Accepted

## Context

A code receipt says what the AI helped with in each session. A grader reading
a repo wants it by file: which files did AI touch, and did it write them or
improve the student's. The markers already record where AI output landed and
which model made it. Nothing rolled that up.

ADR 0006 sets the limits. No number in a student-facing artifact is authored
by automation, and the drift classifier ("unmodified / student-modified /
rewritten") was declined because a marker is a point, not an extent.

## Decision

**An optional top-level `code_files` table, listed from markers and the
ledger, with every row confirmed and every role picked by the student.**

- **`promptcite-check --files`** lists each file carrying a PromptCite marker
  in any state but `@ai-disputed`, with its models, dates, and each marker's
  state. Same scan rules as the gate: comment-opening tags only, nothing in
  strings, prose, or dependency directories. It counts nothing and exits 0.
- **Rows:** `file` (relative, no `..`), `tools`, `role`, and `source`
  (`marker`, `ledger`, or `student`). The ledger adds files the interview
  already read in Step 0 that have no marker.
- **`role` is the student's answer:** `generated`, `improved`, or `both`.
  PromptCite never suggests one. A marker can't tell how much of the file the
  student wrote around it, which is the drift problem again.
- **No numbers.** No line counts, no marker counts, no share. How much is
  the per-session `extent`, which the student picks too.
- **The student can add files.** AI work that never got a marker is
  `source: student`, so the table isn't capped at what the hook happened to
  catch.

Additive under ADR 0003, part of 2.2.

## Consequences

The table is only as complete as the student makes it, like everything else
in a receipt. `source` lets a reader see which rows came from a marker and
which from the student's memory.

A file listed from a marker can be dropped when the student says it's from
another assignment. The rule treats that as a scoping answer, never as the
AI use not having happened.
