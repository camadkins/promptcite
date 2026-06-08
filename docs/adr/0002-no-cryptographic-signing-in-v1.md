<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0002 — No cryptographic signing in v1

**Status:** Accepted

## Context

Receipts are locally editable after generation. A student could change any
field. True non-repudiation would need server-side signing, an institutional
key, or a transparency log — i.e. infrastructure.

## Decision

v1 ships **no cryptographic signing**. Integrity is a **tamper-evident speed
bump**: `content_hash` (receipt fields) and `submission_hash` (the submitted
file). Both are honestly framed as detecting *casual* editing, not as proof.

## Consequences

- PromptCite stays "just a skill" — no servers, keys, or hosted services to
  run, and no network calls (ADR 0004).
- Instructors are told plainly: a determined student can recompute hashes;
  the check matters because casual editing won't bother. Same trust model as
  a hand-written citation.
- Signing / transparency-log integration remains a future direction, gated
  on PromptCite embedding in a larger system — explicitly out of skill scope.
