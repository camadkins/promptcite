# PromptCite

> **A `/receipt` command for AI use in academic work.**
> Open-source. Cross-agent. Self-disclosure, not detection.

PromptCite installs into Claude Code, Gemini CLI, Cursor, Windsurf, Codex,
Copilot, and 20+ other AI coding/writing agents and adds a single command:
`/receipt`. After working with AI on an assignment, a student runs
`/receipt`, answers a few questions in under two minutes, and gets back
three things ready to paste into their submission:

- A properly formatted **citation** (MLA, APA, or Chicago)
- A plain-language **disclosure paragraph** for the paper's header
- A structured **JSON receipt** for instructor review and archival

PromptCite is **not** an AI detector. It produces no originality scores
and makes no claims about whether the work is "AI-written." It is a
transparency artifact for the (large and growing) class of assignments
where AI use is **permitted** and **disclosure is required**.

## How metadata gets filled

PromptCite asks one question at the start of the interview: are you
disclosing AI use from **this current session**, or from a
**previous/different session**?

**This session:** the AI fills in `tool`, `model`, and `date` from its
own self-knowledge. The student doesn't have to remember the exact
model version. The receipt records `metadata_source: "agent_reported"`.

**Previous session:** the student fills in `tool`, `model`, and `date`
from memory. The receipt records `metadata_source: "student_claimed"`.

### What `agent_reported` is and isn't

The `metadata_source` field is a **transparency marker, not a
tamper-proof signature.** After the receipt is generated, it lands on
the student's local disk as a JSON file — and like any local file, the
student can edit it before submitting. PromptCite is a skill that runs
inside the agent; it has no server, no signing key, no transparency
log. The same trust model applies as for any citation: the author
writes it, the reader evaluates it, the artifact is a transparency
record — not a lie detector.

What the `agent_reported` path *does* give you for free is **reduced
friction for honest disclosure**: the student doesn't have to remember
"Claude Opus 4.7" or format today's date in ISO 8601. For students
disclosing in good faith — which is the vast majority — the metadata
fields just work, and the agent-reported flag tells the instructor
those fields came from the agent's mouth rather than the student's
typing.

### Future direction

Closing the post-generation editability gap — cryptographic signing,
inclusion in a transparency log, instructor-side verification — is on
the roadmap as part of an institutional integration layer. The MVP
intentionally stops at the agent-skill layer so it can ship without a
server-side dependency. Anything beyond agent-reported metadata
provenance requires that future layer; PromptCite v1 does not claim to
provide it.

## Status

**v0.1.0 — initial release.** The installer scaffolding and the `/receipt`
interview rule are functional. The native Claude Code adapter installs the
skill and the rule produces schema-conformant output end-to-end. Adapters
for Gemini CLI and the long-tail `npx skills add` registry path are tracked
for the next release.

## Install

See [`INSTALL.md`](./INSTALL.md) for the one-liner and per-agent install
matrix. The architecture: a Node.js installer (`bin/install.js`) wrapped
by thin shell shims (`install.sh`, `install.ps1`) that bootstrap Node and
delegate. One Node brain, two shell shims, no parallel re-implementation.

## License

PromptCite is **dual-licensed**:

- **AGPL v3** for individual students, contributors, researchers, and
  non-commercial open-source use. See [`LICENSE`](./LICENSE).
- **Commercial license** required for universities, edtech vendors, LMS
  integrations, and any hosted-service deployment. See
  [`LICENSE-COMMERCIAL`](./LICENSE-COMMERCIAL) and [`NOTICE.md`](./NOTICE.md).

All contributions require a signed CLA via the cla-assistant.io bot.
See [`CLA.md`](./CLA.md) for the agreement (adapted from the
Harmony HA-CLA-I-LIST 1.0 template).

## Project files

- [`src/rules/receipt.md`](./src/rules/receipt.md) — the `/receipt`
  interview rule file (single source of truth across all agents)
- [`src/schema.yaml`](./src/schema.yaml) — receipt JSON schema
- [`bin/install.js`](./bin/install.js) — the Node installer brain
- [`INSTALL.md`](./INSTALL.md) — install instructions
- [`SECURITY.md`](./SECURITY.md) — vulnerability reporting
- [`MAINTAINERS.md`](./MAINTAINERS.md) — chain of custody
- [`CLA.md`](./CLA.md) — contributor license agreement

## Contributing

1. Read [`CLA.md`](./CLA.md) and sign via the cla-assistant.io bot on
   your first PR. Branch protection enforces this — PRs cannot merge
   without a signature on file.
2. Open an issue before substantive changes — the design is opinionated
   and `src/rules/receipt.md` is the contract every agent depends on.
3. Trivial contributions (typo fixes, doc tweaks) still require CLA
   signature. No "small change" exemption.

Bug reports and feature requests are welcome via GitHub Issues. Security
vulnerabilities should be reported per [`SECURITY.md`](./SECURITY.md).
