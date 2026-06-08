<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# PromptCite — Domain Context

The shared language of this project. Read this before changing behavior so
terms stay consistent across the rule file, the schema, the installer, and
the docs. Architectural decisions live in [`docs/adr/`](./docs/adr/).

## What PromptCite is

A cross-agent `/receipt` command for **AI-use disclosure** on student work.
It is a **transparency tool**, not a detector: it records the AI use a
student *voluntarily discloses*. It cannot, and does not try to, detect the
*absence* of disclosed AI use. The trust model is a citation's: the author
is responsible for accuracy; the reader evaluates plausibility.

## Glossary

- **Receipt** — the structured JSON artifact a `/receipt` run produces,
  conforming to [`src/schema.yaml`](./src/schema.yaml). One receipt covers
  one AI-use session for one assignment.
- **Disclosure paragraph** — the plain-language, paste-into-your-paper
  prose summary of the AI use. Category-specific templates in the rule.
- **Citation** — a formatted reference string for the AI use, in MLA / APA
  / Chicago / IEEE / Harvard. All are generated; the chosen style is shown.
- **`use_category`** — the single closed-set value for *how* the AI was
  used: `brainstorm`, `outline`, `draft`, `edit`, `debug`, `explain`,
  `search`. Drives the interview branch and the disclosure template.
- **Provenance gate** — Step 0 of the interview. Decides whether the
  tool/model/date are filled by the agent (this session) or the student
  (a prior/different session).
- **`metadata_source`** — the record of that decision: `agent_reported`
  (the AI filled tool/model/date from self-knowledge) or `student_claimed`
  (the student typed them from memory).
- **`content_hash`** — SHA-256 of the canonical serialization of the
  receipt's *own fields*. Tamper-evidence for the receipt. Excludes itself
  and `submission_hash` from the digest.
- **`submission_hash`** — SHA-256 of the *submitted file's bytes* (the
  essay, the source file). Binds a receipt to the document it describes.
  Independent of `content_hash`. Optional (schema 1.1).
- **Settings** (`promptcite.config.json`) — per-student, cross-session
  defaults (citation style, name, course) the rule reads to skip repeat
  questions. Configuration, never part of a receipt.
- **Policy** (`promptcite.policy.json`) — per-assignment instructor
  requirements (allowed categories, required style/appendices) the rule
  reads to steer the interview. Configuration, never part of a receipt.
  **Policy overrides settings on conflict.**
- **Adapter** — per-agent install logic in [`bin/install.js`](./bin/install.js).
  Three strategies: global skill install, per-project rule-file drop, and
  surgical begin/end block append into a shared file (`AGENTS.md`, etc.).
- **Universal install** — `promptcite --print-rule`: emit the rule for any
  agent not covered by a bespoke adapter.

## Single source of truth

[`src/rules/receipt.md`](./src/rules/receipt.md) defines all `/receipt`
behavior. Every agent adapter loads it verbatim; `GEMINI.md` is
auto-synced from it (CI enforces the diff). **Behavioral changes happen in
`receipt.md` only** — never duplicate logic into adapters or `GEMINI.md`.

## Non-negotiables

- **No network calls** during receipt generation or in the installer.
- **No telemetry**, analytics, or install IDs.
- **Zero runtime dependencies** (Node built-ins only). See ADR 0004.
- **Local-only writes** — only the current working directory, and only on
  explicit student request.
