<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0005 — One receipt covers one session

**Status:** Accepted

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
