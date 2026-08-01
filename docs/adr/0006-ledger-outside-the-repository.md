<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0006 — The AI-use ledger lives outside the repository

**Status:** Accepted

## Context

`/receipt` asks the student to reconstruct their AI use from memory. By
submission time, "roughly what percentage appears verbatim?" is a guess, and an
honest student guessing badly is the failure mode that matters most. An optional
capture layer — a hook that records AI-insertion events as they happen — removes
the guess.

That capture layer creates something PromptCite has never had: a durable,
timestamped, machine-readable record of a student's AI use. Where that record
lives decides what the tool *is*. Inside the working tree, a `.gitignore` is the
only thing standing between it and a third party, and `.gitignore` defends
against `git add`, not against people — staff-accessible cloud IDEs,
zip-the-folder submissions, `git add -f`, repo handoffs, and integrity
proceedings that simply *ask* all route around it. A student who cannot be sure
where the record ends up will not turn the feature on, and an instructor cannot
honestly promise it is not evidence.

## Decision

**PromptCite must be structurally incapable of testifying against the student
who installed it.** Three consequences, all binding:

1. **Location.** Ledger events are written to `~/.promptcite/ledgers/<hash>.jsonl`,
   deliberately outside any repository. `<hash>` is the first 16 hex characters of
   `sha256(realpath(cwd))`, so events are scoped per project without the path
   itself being stored.
2. **Consume-and-purge.** `/receipt` deletes the events it used once the interview
   has consumed them. Unconsumed events expire after `ttl_days` (default 30). No
   corpus accumulates.
3. **No verification behavior.** The ledger's only consumer is the interview. It
   jogs the student's memory; it never produces a percentage, count, score, or
   classification. No number in any student-facing artifact is authored by
   automation.

We also decline a **drift classifier** — re-hashing marked code to report
"unmodified / student-modified / rewritten-away." Beyond being the most
surveillance-flavored thing the design could do, it is not soundly implementable:
an in-file marker is a *point*, not an *extent*, so re-locating a region's end
needs either paired begin/end markers (the in-file noise the sidecar exists to
avoid) or a per-language AST parser (ADR 0004). Hashing the whole enclosing
declaration over-claims — a formatter run or import reorder would report a
student modification that never happened.

The ledger is off by default. Enabling it is the student's explicit request, or
an instructor requirement via `promptcite.policy.json`.

## Consequences

- The `local-only writes` non-negotiable in `CONTEXT.md` is amended: writes stay
  on the student's machine, but the ledger is intentionally written *outside* the
  working directory rather than inside it. The exception exists to protect the
  student, not to widen the tool's reach.
- Purging costs the long-horizon institutional product nothing. Per ADR 0002, an
  institution cannot trust a locally editable artifact anyway; verification there
  requires institutional custody. What must not be foreclosed is the *schema*, not
  this file's persistence.
- The ledger is incomplete by construction. A student who asks for pseudocode and
  types it themselves generates no events. That is acceptable for a private memory
  aid and would be actively harmful if the ledger were ever presented as a
  complete record — which is why it is not an output.
- `sha256` of inserted bytes is deliberately absent from the v1 event shape. It
  serves only verification. ADR 0003's additive policy allows adding it later
  without breaking v1 readers.
