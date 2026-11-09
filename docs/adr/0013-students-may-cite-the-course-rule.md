<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0013 — A student may choose to cite the course rule in their disclosure

**Status:** Accepted
**Amends:** [ADR 0009](./0009-course-policies-from-the-syllabus.md), [ADR 0011](./0011-ai-levels-warn-never-gate.md)

## Context

ADR 0009 kept course files off every receipt: "PromptCite still cannot testify
against its user." ADR 0011 did the same for AI levels. Both were right about
what PromptCite does on its own.

Students asked for the opposite in one spot. A disclosure that says "Per the
CSCE 423 AI policy ("AI may be used to help you understand course concepts"),
I used Claude to have the master theorem explained" answers the instructor's
first question before they ask it. The student already has the syllabus, and so
does the instructor. Quoting it back hides nothing from either of them.

## Decision

**The student may cite one course rule in their disclosure paragraph. PromptCite
offers, shows the exact sentence, and writes it only on a yes.**

- **Opt-in, every receipt.** No setting turns it on for good. The offer comes
  once, before output, with the full sentence the student would be signing.
- **Only rules that permit the use.** The quote comes from the `ai_level`
  when every logged use is within it, or from a course `guidance` entry that
  plainly allows the category when no level applies. Over the level, in
  `unclear`, or needing a generous reading means no offer, and the paragraph
  uses plain wording. A disclosure must never claim permission the rule
  doesn't give.
- **Word for word.** `{quote}` is the instructor's text, untranslated, as the
  student confirmed it. Assembled from the `cite.rule` disclosure string.
- **One quote, nothing else.** The level, the warning, the rest of the
  guidance, the `unclear` list, and the course file itself still never reach a
  receipt.

## Consequences

The 0009 line still holds for everything PromptCite does on its own. What
changed is that the student can choose to put their instructor's words next to
their own, the way they could by typing them.

A cited rule can be stale if the syllabus changed after the course file was
made. The student sees the sentence before agreeing, which is the same check
they'd do typing it themselves.

Since the offer depends on `promptcite policy check` saying `within:`, the
citation inherits ADR 0011's limit: on AIAS, levels 3 to 5 look the same to
it.
