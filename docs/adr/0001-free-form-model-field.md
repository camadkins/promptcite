<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0001 — `model` is a free-form string, not an enum

**Status:** Accepted

## Context

A receipt records which AI model was used (`ai_use.model`). New models ship
constantly, and tiers within a family (Opus / Sonnet / Haiku) and versions
(4.7 vs 4.8) matter for accurate disclosure. We considered constraining
`model` to an enum of known models for validation strength.

## Decision

`model` stays a **free-form string**. The guidance in `receipt.md` asks the
agent (or student) to be specific — tier **and** version, e.g. "Claude Opus
4.8" — and to flag uncertainty rather than invent precision.

## Consequences

- Any current or future model fits with **zero schema maintenance**. No
  enum to update on every release; no stale list rejecting valid models.
- Maximally specific disclosure is possible.
- Trade-off: no machine validation that a model name is "real." Acceptable —
  PromptCite is a transparency record, not a model registry, and an enum
  would be a recurring maintenance burden that fails closed on new models.
- PromptCite must **not** editorialize on model behavior (e.g. "more
  literal") — it records which model, not an analysis of it.
