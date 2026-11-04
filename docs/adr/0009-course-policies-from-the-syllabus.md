<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0009 — Course policies come from the syllabus, held by the student

**Status:** Accepted
**Relates to:** [ADR 0006](./0006-ledger-outside-the-repository.md)

## Context

`promptcite.policy.json` assumes an instructor who writes one. Most don't. The
rules that actually govern a student's AI use sit in a syllabus PDF, in a
section called "Academic Integrity" or "AI Tools," and they differ from class
to class: one course allows AI to explain but not to solve, another bans it
outright on exams, a third says nothing at all.

A student taking four classes holds four different rule sets in their head, and
the agent helping them holds none. It advises the same way in every class,
which is wrong for at least three of them. What the student wants is to hand
the syllabus over once and have PromptCite know, from then on, what that class
allows when they say "I'm working on CSCE 423."

## Decision

**A course file holds one class's AI rules, read from its syllabus by the
student's own agent and kept by the student.** It lives at
`~/.promptcite/courses/<id>.json`, next to the ledger and for the same reason:
it's personal configuration, and a working tree is the wrong place for it.

- **Intake is a rule mode, not installer code.** `/receipt course add <file>`
  reads a local syllabus and drafts the course file. Reading a syllabus takes a
  model, and the installer never calls one. The draft is shown in full and
  written only on the student's yes. A URL gets "download it and give me the
  file," never a fetch.
- **Every rule carries its quote.** A `guidance` entry is a plain-language rule
  plus the syllabus's verbatim text it came from. `promptcite course check`
  refuses an entry without a quote. A paraphrase with no source is how "ask
  first" becomes "allowed," and it's the failure this design is built around.
- **What the syllabus leaves open is recorded as open.** Vague or missing
  topics go in `unclear`, and the answer to them is "the syllabus doesn't say;
  ask your instructor." Silence is never permission.
- **Resolution is explicit.** A folder binding (`promptcite course use <id>`)
  wins; otherwise a course the student names is matched against id, name, and
  aliases and confirmed in one line. The agent never guesses a course from the
  directory.
- **Precedence: assignment policy > course policy > settings.** The course
  policy uses the same keys as `promptcite.policy.json` and steers the
  interview the same way. The assignment file wins because it is the more
  specific instruction.
- **The capture switches stay assignment-only.** `require_ledger`,
  `require_markers`, and `require_attestation` are rejected in a course file.
  The hook reads only the assignment's policy file, and a course file that
  claimed to turn recording on would be a promise the tool doesn't keep.

## Consequences

The agent can now say something useful at the moment it matters: when the
student picks "draft" in a class that forbids drafting, the interview shows the
rule and its quote. `/receipt ask` answers "can I use AI to check my proof?"
from the syllabus rather than from the model's general opinion of academic
integrity.

The course file is a reading of the syllabus, not the syllabus. A model can
misread one, a syllabus can change mid-term, and the student can edit the file
to say whatever they like. The quote requirement makes the first two visible
(the student and anyone they show it to can check the rule against the words)
and the third is the same trust model as everything else here: the student is
responsible for what they tell PromptCite. Course files advise. They don't
enforce, and nothing reads them except the student's own agent.

**PromptCite still cannot testify against its user.** A course file is never
written into a receipt, a ledger, or a marker. Only values that already have a
receipt field, the course name and instructor, reach a receipt, exactly as if
the student had typed them. Which classes a student has set up, and how they
read each syllabus, stays on their machine.
