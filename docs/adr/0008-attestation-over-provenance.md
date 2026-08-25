<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0008 — Attestation: record the verification, not just the provenance

**Status:** Accepted
**Relates to:** [ADR 0006](./0006-ledger-outside-the-repository.md)

## Context

Everything PromptCite recorded up to now answered one question: *did AI touch
this?* The receipt answers it for a submission, the ledger answers it for an
insertion, and the `@ai-assisted` marker answers it for a block of code.

That is not the question a lot of instructors are actually asking. The position
that keeps coming up, and the one that prompted this ADR, goes: an LLM's output
isn't yours when it appears; it becomes yours when you check it. Verification is
the moment authorship transfers. An instructor holding that view doesn't need to
know that AI wrote a function — they assume it might have. They want to know
whether the student read it.

PromptCite had nowhere to record that. Worse, the `@ai-assisted` marker had no
lifecycle at all: the hook wrote it, and then nothing ever happened to it. It
decorated code. A stamp that is never closed out asks nothing of anybody, and
students learned to scroll past it within a week.

## Decision

**A marker can be a pending claim rather than a stamp.** With `markers.attest`
on, the hook writes `@ai-unverified` instead of `@ai-assisted`. The student
clears it with `/receipt attest`, which asks what they checked and writes their
answer into the marker in their own words.

**`promptcite-check` is the gate.** It walks the project, lists every marker
still pending, and exits non-zero while any remain. A student runs it on
themselves before submitting, the way they'd run a linter.

**Schema 2.1 adds an optional per-session `verification` object** so an
attestation can travel with the receipt as well as the code.

Three things this deliberately is not:

- **Not on by default.** Flipping every existing install to `@ai-unverified`
  would retroactively mark already-submitted student work as unfinished.
  Provenance-only markers keep working exactly as they did.
- **Not a detector, and structurally incapable of becoming one.** `check` finds
  markers. Markers land only on `Edit` insertions of `min_lines` or more, in
  file types whose comment syntax is known, at an unambiguous line start. AI use
  that never became one of those leaves nothing to find. A clean run means the
  student's to-do list is empty, and any doc that implies more than that is
  wrong.
- **Not verified verification.** Nothing checks the attestation against the
  code. A student who writes "looks fine" has produced a weak attestation, not a
  false one, and PromptCite has no opinion about which it is. Same trust model
  as a citation, which is the trust model the whole project runs on.

## Consequences

The good one is that disclosure stops being paperwork filed after the work and
becomes the last step of the work. A student clearing markers is rereading code
the model wrote, which is the behavior the instructor wanted in the first place
and the one no amount of receipt-filing produced.

The cost is a second vocabulary. `/receipt verify <file>` already meant
"recheck this receipt's hash," so the new mode is `attest` and the two must stay
distinct in every doc. They are different acts: verification is something an
instructor does to a receipt, attestation is something a student does to their
own work.

The real risk is misreading. A gate that exits non-zero looks authoritative, and
an instructor could start treating a clean `promptcite-check` as evidence that a
submission is honest. It isn't, it can't be, and the partial-coverage limit is
stated in `docs/for-instructors.md`, in `check --help`, and at the top of
`bin/check.js` for exactly that reason. If the tool is going to be misread, it
should at least have said so everywhere a reader could plausibly look.
