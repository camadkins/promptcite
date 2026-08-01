<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0007 — One receipt covers a whole assignment

**Status:** Accepted
**Supersedes:** [ADR 0005](./0005-single-session-scope.md)

## Context

ADR 0005 scoped one receipt to one AI-use session and named multi-session
disclosure as a known gap, to be resolved deliberately in a schema 2.0 rather
than bolted on additively. That was the right call about *how* to fix it. What
it under-weighted is that the gap was not a missing feature — it was a defect
that produced the exact harm PromptCite exists to prevent.

A real assignment is worked across days. An outline on Monday, a debug session
on Thursday, an edit pass the night before it's due. Three things combined to
turn that ordinary case into under-disclosure:

1. `ai_use` was a single object, so a receipt structurally could not describe
   more than one session.
2. `/receipt` defaulted to writing `ai-receipt.json` in the working directory
   with **no collision check**, so a second run silently overwrote the first.
3. The rule file instructed students to run `/receipt` once per session and
   "combine manually," with no mechanism to combine and no warning that the
   default path would destroy the previous receipt.

A student who followed the documented workflow ended up submitting one session's
disclosure, having done the work to disclose three, and believing they had.
Silent under-disclosure is worse than no tool: they relied on it.

The fix is not a filename collision check. Two files on disk still leave one
`ai_use` object in whatever gets submitted. The defect is the schema.

## Decision

**`ai_use` becomes an ordered array of sessions.** One receipt covers one
assignment, however many sessions that took. A one-session receipt is an array
of one, and must read no worse than a 1.1 receipt did.

Fields that describe a single session move onto the session:

- `metadata_source` — provenance is per-session. A session disclosed inside the
  tool is `agent_reported`; one typed from memory a week later is
  `student_claimed`. A single top-level value stops being answerable the moment
  there are two.
- the citation strings — a citation names one prompt, one tool, one model, one
  date. `outputs.citation_mla` becomes `ai_use[i].citations.mla`.
- `appendix` — a share link or a diff belongs to the conversation it came from.

`outputs` keeps only `disclosure_statement`: one paragraph covering every
session, because the student pastes one paragraph into one submission.
`submission_hash` stays top-level — it hashes the submitted document, and there
is one document. `content_hash` keeps its algorithm; only the input shape moves.

**The upgrade path and the append path are the same path.** When `/receipt` is
run in a directory that already holds a receipt for this assignment, it offers to
add a session. Doing so reads the file, wraps a 1.x `ai_use` object into
`ai_use[0]`, appends the new session, and writes it back as 2.0. Nothing is ever
overwritten; choosing a new receipt instead writes to the next free filename.

## Consequences

- **This is a breaking change**, the first one. Consumers must branch on
  `schema_version`. `bin/verify.js` validates both shapes and will keep doing so.
- The package major moves to 2.0.0 alongside the schema. An institution reading
  `promptcite@1.3.0` emitting `schema_version: 2.0` would have no reason to
  expect the two numbers to disagree.
- **Timing was the deciding factor.** With no published package and no external
  users, a breaking receipt change costs nothing today. It becomes a permanent
  migration burden the moment PromptCite is on npm. This ADR is therefore a
  prerequisite for publishing, not a peer of it — ship the format that can
  describe the common case before anyone depends on the one that can't.
- The `multi-session aggregation is a known MVP gap` note in ADR 0005 and the
  matching edge case in the rule file are both removed. Leaving guidance that
  produces under-disclosure in place would be worse than the original bug.
- Still out of scope: aggregating receipts *across assignments*, and any change
  to the trust model. A receipt with four sessions is no more verifiable than one
  with a single session — see ADR 0002. More disclosure is not more proof.
