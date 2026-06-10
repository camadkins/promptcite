# PromptCite

> Cross-agent `/receipt` for honest AI use disclosure on student work.

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL_v3-blue.svg)](./LICENSE)
[![CI](https://github.com/camadkins/promptcite/actions/workflows/ci.yml/badge.svg)](https://github.com/camadkins/promptcite/actions/workflows/ci.yml)
[![CodeQL](https://github.com/camadkins/promptcite/actions/workflows/codeql.yml/badge.svg)](https://github.com/camadkins/promptcite/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/camadkins/promptcite)](https://github.com/camadkins/promptcite/releases)
[![OSSF Scorecard](https://api.scorecard.dev/projects/github.com/camadkins/promptcite/badge)](https://scorecard.dev/viewer/?uri=github.com/camadkins/promptcite)

## Install

**macOS, Linux, WSL, Git Bash**

```bash
curl -fsSL https://raw.githubusercontent.com/camadkins/promptcite/main/install.sh | bash
```

**Windows (PowerShell 5.1+)**

```powershell
irm https://raw.githubusercontent.com/camadkins/promptcite/main/install.ps1 | iex
```

Installs into every supported AI agent on your machine. ~30 seconds, idempotent, safe to re-run. Per-agent commands and flags in [INSTALL.md](./INSTALL.md).

## What it is

PromptCite installs into 24 AI coding/writing agents (Claude Code, Gemini CLI, Cursor, Windsurf, Codex, Copilot, Cline, Continue, Roo, Aider, Amazon Q, Kiro, Augment, Trae, JetBrains Junie, Goose, Replit, OpenHands, Qodo, Zed, opencode, Amp, Crush, Jules) — plus any other `AGENTS.md`-aware agent automatically, and anything else via `promptcite --print-rule` — and adds a single command: `/receipt`. After AI-assisted work, a student runs `/receipt`, answers a handful of questions in under two minutes, and gets back three things to paste into their submission:

- A formatted **citation** (MLA, APA, Chicago, IEEE, or Harvard).
- A plain-language **disclosure paragraph** for the paper's header.
- A structured **JSON receipt** for instructor review and archival.

It is not an AI detector. It produces no originality scores. It is a transparency artifact for assignments where AI use is **permitted** and **disclosure is required**.

## See it in action

Student finishes a policy essay in Claude Code. Fresh session.

```
> /receipt

Are you disclosing AI use from this current session, or previous?
> this session

A few quick details, answer all:
  1. course, instructor, assignment title
  2. your name or ID for this receipt
  3. citation style (MLA / APA / Chicago / IEEE / Harvard)
> ENGL 251, Dr. Martinez, Policy Analysis Essay, C. Hawkins, MLA

What did you use the AI for?
  brainstorm / outline / draft / edit / debug / explain / search
> brainstorm

  (1) one-sentence summary of what you asked the AI to brainstorm
  (2) did any AI-generated text appear verbatim?
> counterarguments to carbon tax policies / no

Anything to add for the revision statement?
> Used the list to structure my own outline, rewrote arguments in my own words.

══════ AI Use Receipt ══════

CITATION (MLA):
  "Counterarguments to carbon tax policies." prompt. *Claude*,
  Opus 4.7 version, Anthropic, 14 May 2026.

DISCLOSURE:
  I used Claude (Opus 4.7) on 2026-05-14 to brainstorm counterarguments
  to carbon tax policies for this assignment. No AI-generated text
  appears in the final submission. I used the list to structure my own
  outline and rewrote the arguments in my own words. This receipt was
  generated inside Claude itself, so the tool, model, and date fields
  above were agent-verified rather than student-reported.

JSON receipt saved as ai-receipt.json (content_hash dc84..4ed1).
Paste citation in your Works Cited. Paste disclosure in your paper's
header. Attach ai-receipt.json to your submission.

Five turns. Under two minutes. Receipt is yours to submit.
```

A real sample receipt is in [examples/brainstorm-receipt.json](./examples/brainstorm-receipt.json). The full instructor-side reading guide is in [docs/for-instructors.md](./docs/for-instructors.md).

## Verifying a receipt

Each receipt includes a `content_hash` field (sha256 of the canonical other fields). Instructors can verify the receipt was not edited between generation and submission:

```bash
npx -y github:camadkins/promptcite promptcite-verify receipt.json
```

Exit `0` means the hash matches. Tamper-evident, not tamper-proof: the algorithm is public and a determined student can recompute the hash after editing. For most disclosures this is a meaningful speed bump. Full discussion in [docs/for-instructors.md](./docs/for-instructors.md).

## License

PromptCite is **dual-licensed**: **AGPL v3** for individual students, contributors, researchers, and non-commercial open-source use. A separate **commercial license** is required for universities, edtech vendors, LMS integrations, and any hosted-service deployment.

- Community use: [LICENSE](./LICENSE) (AGPL v3 verbatim)
- Commercial inquiries: [LICENSE-COMMERCIAL](./LICENSE-COMMERCIAL)
- Plain-language summary: [NOTICE.md](./NOTICE.md)

All contributions require a signed CLA. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contributor flow.

## Docs

- [INSTALL.md](./INSTALL.md) per-agent install commands and flags
- [docs/for-instructors.md](./docs/for-instructors.md) instructor reading guide
- [CONTRIBUTING.md](./CONTRIBUTING.md) how to contribute
- [SECURITY.md](./SECURITY.md) vulnerability reporting and threat model
- [CHANGELOG.md](./CHANGELOG.md) release notes
- [examples/](./examples/) sample receipt artifacts
