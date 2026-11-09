<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0011 — AI levels per assignment: AIAS by default, warn but never gate

**Status:** Accepted, amended by [0013](./0013-students-may-cite-the-course-rule.md)
**Relates to:** [ADR 0009](./0009-course-policies-from-the-syllabus.md)

## Context

A lot of instructors now state AI rules as a level, not a list of allowed
uses. The most common scale is the AI Assessment Scale (AIAS, Perkins, Roe
and Furze, 2024), with five levels: No AI, AI Planning, AI Collaboration,
Full AI, AI Exploration. A syllabus says "homework is Level 2, the final
project is Level 3," and the level changes from one assignment to the next
inside the same class.

`allowed_categories` can't hold that. It's one list for the whole policy file
or course, and it says nothing about where the rule came from. Students asked
for something that tells them, before they hand in a receipt, that what they
logged goes past what the assignment allows.

## Decision

**An `ai_level` is a level plus the rule's own words, set per assignment.**

- **Where it lives.** `ai_level` is a policy key in `promptcite.policy.json`
  and in a course file's `policy`. A course file can also carry
  `assignments`, a list of `{ name, aliases, ai_level }`, for a syllabus that
  sets a level per kind of assignment. Precedence is the same as every other
  key: assignment policy > course assignment > course policy.
- **AIAS is the default scale. Custom scales are allowed.** `level` is 1 to 5
  on AIAS unless `scale` names another one, given inline as levels with
  labels and the use categories each allows.
- **A quote is required.** Same reason as ADR 0009: a level with no words
  behind it is a paraphrase nobody can check. `promptcite course check` and
  `promptcite policy check` reject one without a quote.
- **AIAS maps to categories as PromptCite's reading, written down.** Level 1
  allows nothing. Level 2 allows brainstorm, outline, search, and explain.
  Levels 3 to 5 allow all seven. This is our reading, not part of the scale,
  and it's in one place (`bin/level.js`) so it can be argued with.
- **It warns. It never gates.** `promptcite policy check <uses>` prints the
  level, the uses past it, and the quote. `/receipt` runs it before output
  and shows the warning as printed, then writes the receipt anyway. The exit
  code is 0 either way.
- **The intake flow never invents a level.** `/receipt course add` sets one
  only where the syllabus names it. "AI may help you brainstorm" goes in
  `guidance`, not into a level 2.

## Consequences

Students see the rule at the one moment it matters, in the instructor's
words, from a file and not from the model's memory of it. The CLI does the
comparison so the warning is the same text every time and can be tested.

The check can only tell levels 1 and 2 apart from the rest. Levels 3, 4, and
5 differ in how much of the work AI may produce, and a use category doesn't
show that. A level 3 assignment where AI wrote most of the paper gets no
warning. That's a known gap, and the honest answer to it is the stage and
extent fields planned for the same release, not a guess here.

A warning never blocks a receipt and never changes one. The student who used
AI past their level and discloses it is doing what PromptCite exists for.
Refusing or nudging them to soften the answer would teach the opposite. The
level, its quote, and the warning stay on the student's screen and never go
into a receipt, the same as course files.
