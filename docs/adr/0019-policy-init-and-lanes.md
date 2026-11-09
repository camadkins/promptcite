<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0019 — `promptcite policy init`, and lanes as a custom scale

**Status:** Accepted

## Context

An instructor who wants `/receipt` to know an assignment's AI level had to
hand-write `promptcite.policy.json`, with an `ai_level` the validator would
accept. Few will. Many universities also don't use the AIAS. The University
of Sydney's two-lane model is widespread: Lane 1 is secured assessment, where
AI use is controlled, and Lane 2 is open, where AI may be used. Sydney's own
guidance says Lane 1 doesn't automatically mean no AI.

## Decision

**A small instructor command that asks for the scale, the level or lane, and
the rule as written, then writes the policy after the same validator
`/receipt` uses has passed it.**

- **AIAS or lanes.** AIAS writes `{ level, quote, where? }` as before. Lanes
  write a custom scale inline (ADR 0011 already supports one), so nothing
  downstream knows about lanes and `policy check` works unchanged.
- **Lane 1's uses come from the instructor.** Since Lane 1 means controlled,
  not banned, the command asks which uses it allows, or "none". Lane 2 allows
  every use. PromptCite doesn't guess what "secure" means for a course.
- **The rule is required and kept word for word.** Trimmed of surrounding
  whitespace, never reworded. Empty is refused.
- **Safe writes.** Other keys in an existing file are kept. An existing
  `ai_level` needs `--force`. A file that isn't valid JSON is left alone. With
  no terminal, it writes only on `--yes`, and never guesses a missing answer.
- **One file per assignment folder,** the same place `/receipt` already reads
  it from.

## Consequences

Instructors get a file `/receipt` will accept the first time. The two-lane
model is a preset in the command, not a scale built into PromptCite, so a
school with its own scale can still write one by hand.

The command can also turn on the reflection questions (ADR 0016). Other
policy keys are still hand-edited for now.
