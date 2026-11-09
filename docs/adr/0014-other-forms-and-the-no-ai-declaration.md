<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0014 — Other forms of the disclosure, and a no-AI declaration that isn't a receipt

**Status:** Accepted

## Context

The disclosure paragraph fits the top of a paper. It doesn't fit everywhere a
student has to disclose. Canvas and other LMS submission boxes want a line.
Journals want a fixed declaration in their own words: Elsevier's, updated June
2026, is "During the preparation of this work the author(s) used [NAME OF
TOOL/SERVICE] in order to [REASON]. After using this tool/service, the
author(s) reviewed and edited the content as needed and take(s) full
responsibility for the content of the publication."

And some courses ask every student to say whether they used AI, including the
ones who didn't. A student whose work gets flagged by a detector wants to have
said so before anyone asked.

MLA's 2025 guidance asks for the model version and a link to the chat when
there is one. Both were already in the receipt: `model` is required, and the
share link has lived in `appendix.share_link_or_excerpt` since 2.0, with
every citation template branching on it. Nothing needed adding there.

## Decision

**Two optional forms of the same disclosure, and a declaration for no AI use
that is deliberately not a receipt.**

- **`outputs.short_statement`** is one line, at most 300 characters, and
  **`outputs.journal_statement`** is the journal declaration. Both are built
  from disclosure strings (`short.*`, `journal.*`), cover every session, and are
  written only when the student asks or `extra_statements` names them. Neither
  replaces `disclosure_statement`. Additive under ADR 0003, part of 2.2.
- **The journal form uses Elsevier's wording** unless the student pastes their
  journal's own, which is then used exactly. It's not written when the only
  tools were basic spelling, grammar, or reference checkers, since Elsevier
  doesn't ask for those.
- **`/receipt none` writes a no-AI declaration as text, with no JSON.**
  `ai_use` needs at least one session. A receipt with none would break every
  verifier already deployed, and hashing a claim that nothing happened doesn't
  make it any truer. It is the student's statement and says so.
- **The declaration checks first.** It isn't written when the ledger or a
  receipt for the assignment shows AI use, unless the student says those
  entries are from other work. A checker that rewrote or suggested wording is
  AI use, and the student gets the interview instead.

## Consequences

Instructors may see three shapes of the same facts. All three come from the
same answers, and the receipt holds all of them, so a mismatch between them is
visible.

A no-AI declaration can be false, and PromptCite can't tell. That's no
different from a receipt that leaves a session out. The closing line points
the student at their drafts and version history as the evidence that
actually exists.

Elsevier's wording can change. It's one string in `src/locales/en.md`, dated
in the rule, and a journal's own wording always wins.
