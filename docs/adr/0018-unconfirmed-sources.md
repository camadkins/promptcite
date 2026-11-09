<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0018 — Unconfirmed sources: list them, flag them, never look them up

**Status:** Accepted

## Context

AI tools invent sources that look real: plausible authors, a real journal, a
year that fits. A student who cites one gets caught for something that started
as a search. The receipt already asked one yes/no question
(`source_verification`) on `search` sessions and on drafts with factual
claims. A single boolean can't say which source is the problem, and nothing
warned the student before they handed it in.

## Decision

**An optional per-session `sources` list that `source_verification`
summarizes, a flag before output naming any source the student hasn't
confirmed, and no lookups.**

- **The list:** `{ ref, confirmed, how? }` per source, as the student names
  it. Only on sessions where `source_verification` already applies. It extends
  that field rather than duplicating it: with a list, the boolean is true
  exactly when every source is confirmed, and the verifier rejects a receipt
  where they disagree.
- **The flag:** before output, the interview names each unconfirmed source and
  says why it matters. It doesn't block the receipt or ask the student to change
  an answer. If they go check one, the answer changes because the facts did.
- **In the report:** `promptcite-verify` names unconfirmed sources in an advisory
  note. Advisory, because an honest "I didn't confirm this" is a complete
  receipt.
- **No lookups.** PromptCite never searches for a source, fetches a DOI, or
  judges whether one exists. That would be a network call (ADR 0004), and
  checking the student's sources is the student's job, not the tool's.
- **Named, not counted.** No "2 of 3 confirmed."

Additive under ADR 0003, part of 2.2. A student can still answer the plain
yes/no and skip the list.

## Consequences

"Confirmed" is the student's word, like every other answer. A reader who cares
can look up the named sources, and now knows which ones to start with.

The disclosure gains `search.partly_verified` for the mixed case, so the
paragraph says which sources were checked instead of falling back to "I did
not independently verify those sources."
