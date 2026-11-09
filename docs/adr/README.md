<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# Architecture Decision Records

Short records of the load-bearing decisions behind PromptCite — why things
are the way they are, so a future change doesn't quietly undo a deliberate
choice. Format: Status / Context / Decision / Consequences.

| ADR | Decision | Status |
|-----|----------|--------|
| [0001](./0001-free-form-model-field.md) | `model` is a free-form string, not an enum | Accepted |
| [0002](./0002-no-cryptographic-signing-in-v1.md) | No cryptographic signing in v1 | Accepted |
| [0003](./0003-additive-schema-version-policy.md) | Additive schema-version policy | Accepted |
| [0004](./0004-zero-runtime-dependencies.md) | Zero runtime dependencies | Accepted |
| [0005](./0005-single-session-scope.md) | One receipt covers one session | Superseded by 0007 |
| [0006](./0006-ledger-outside-the-repository.md) | The AI-use ledger lives outside the repository | Accepted, amended by 0015 |
| [0007](./0007-multi-session-receipts.md) | One receipt covers a whole assignment | Accepted |
| [0008](./0008-attestation-over-provenance.md) | Attestation: record the verification, not just the provenance | Accepted |
| [0009](./0009-course-policies-from-the-syllabus.md) | Course policies come from the syllabus, held by the student | Accepted, amended by 0013 |
| [0010](./0010-session-pointers-and-course-context.md) | Session pointers and course context: point at the agent's transcript, never copy it | Accepted |
| [0011](./0011-ai-levels-warn-never-gate.md) | AI levels per assignment: AIAS by default, warn but never gate | Accepted, amended by 0013 |
| [0012](./0012-stage-and-extent.md) | Stage and extent: closed lists the student picks from | Accepted |
| [0013](./0013-students-may-cite-the-course-rule.md) | A student may choose to cite the course rule in their disclosure | Accepted |
| [0014](./0014-other-forms-and-the-no-ai-declaration.md) | Other forms of the disclosure, and a no-AI declaration that isn't a receipt | Accepted |
| [0015](./0015-process-timeline.md) | Process timeline: the student's own record, hash-chained, ledger only on request | Accepted |
| [0016](./0016-reflection-questions.md) | Reflection questions: four fixed questions, one answer set per receipt, verbatim | Accepted |
| [0017](./0017-file-table-for-code.md) | File table for code: markers say where, the student says what | Accepted |
