<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0015 — Process timeline: the student's own record, hash-chained, ledger only on request

**Status:** Accepted
**Amends:** [ADR 0006](./0006-ledger-outside-the-repository.md)

## Context

A student whose work is flagged by an AI detector has no good answer. A
disclosure says what they used AI for, but it doesn't show the work happening.
What does show it already sits on their machine: receipts written as they went
and, for most code and many essays, a git history. Nothing put those in order
or in a form they could hand over.

The ledger has the third piece, and ADR 0006 keeps it from ever being an output:
it's incomplete by construction, and PromptCite must not be able to testify
against its user.

## Decision

**`promptcite timeline` writes the assignment's receipt sessions and git commits
in date order, hash-chained, to a local `.json` and `.md`. The ledger goes in
only when the student asks and has seen the entries.**

- **Sources.** Receipt sessions (tool, model, category, prompt summary, and a
  share link when the student attached one) and `git log` for the current
  folder (hash, date, subject, line counts; no diffs, no author email). Git is
  read locally with `execFile` and an argument array. Nothing leaves the
  machine.
- **The ledger is opt-in per run.** `--with-ledger` lists the entries first and
  asks. Each one is labeled "incomplete by design" in both files. This amends
  0006's third consequence for this one case: the student, not PromptCite,
  decides to hand over their own notes, the way they could by copying them.
- **The chain.** Each entry carries the hash of the one before it, and the
  first carries the hash of the header (version, time, student, assignment,
  sources). Editing, removing, or reordering anything breaks it, and
  `promptcite timeline verify` says where.
- **Anchoring is the student's move.** There's no network and no signing (ADR
  0002), so nothing outside the file vouches for when it was made. A student
  who hands in the head hash with their work makes any later copy checkable
  against it. Git commit hashes already chain the commits themselves.
- **Wording.** The file calls itself evidence of process. It never calls itself
  proof, and it states what it can't show: that the list is complete, when the
  file was made, or that git history wasn't changed first.

## Consequences

A timeline is as honest as its inputs. Git history can be rewritten before
export, and a student can recompute the chain after editing, the same limit
`content_hash` has. What the chain adds is that a copy handed over earlier and
one shown later can be compared.

`/receipt` purges the ledger entries it uses, so a student who wants ledger
notes in a timeline has to run it before writing the receipt. That's
deliberate: the ledger is still built to be forgotten.

Nothing here counts or scores. The timeline lists; any reading of it is the
reader's.
