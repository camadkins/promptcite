<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0005 — One receipt covers one session

**Status:** Superseded by [ADR 0007](./0007-multi-session-receipts.md) (2026-08-01)

> **Superseded.** The decision below was correct that multi-session support
> belonged in a deliberate schema 2.0 rather than an additive bolt-on. It was
> wrong to file the gap as a known limitation and leave the workaround in place:
> the rule file told students to run `/receipt` per session and combine by hand,
> while the default output path silently overwrote the previous receipt. The
> ordinary case — an assignment worked across several days — therefore ended in
> under-disclosure. `ai_use` is now an ordered array of sessions. Kept here
> because the reasoning about *how* to change the schema is still the record.

## Context

Students often use AI across multiple sessions, tools, and days for one
assignment. Representing that fully would mean an array of `ai_use` entries
or a session list — a structural change to the receipt schema.

## Decision

v1.x scopes **one receipt to one AI-use session**. `ai_use` is a single
object (one tool, one model, one category). A student disclosing multiple
sessions runs `/receipt` per session and combines manually; the rule says so
in its edge cases.

## Consequences

- The interview and schema stay simple and fast (the "under 2 minutes" rule).
- Known gap: multi-session / multi-tool disclosure is not first-class.
- Resolving it is a deliberate **schema 2.0** change (multi-entry `ai_use`),
  tracked in the private roadmap — not bolted on additively.
