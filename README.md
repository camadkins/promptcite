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

## Status

> 🚧 Pre-release. The repository is **private** until the release-gate
> checklist is complete. Do not assume any file in this tree is final.

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

Once the repo is public:

1. Read `CLA.md` and sign via the cla-assistant.io bot on your first PR.
2. Open an issue before substantive changes — the design is opinionated
   and `src/rules/receipt.md` is the contract every agent depends on.
3. Trivial contributions (typo fixes, doc tweaks) still require CLA
   signature. No "small change" exemption.

Until the repo is public, contributions are not accepted via PR. Reach
out to the maintainer if you have early feedback on the spec.

