---
name: Add an agent adapter
about: Add /receipt support for an AI agent not yet in the matrix
title: 'feat: add <Agent> adapter'
labels: 'good first issue, agent-adapter'
---

## Which agent

<!-- Name + link to the agent. -->

## How it reads project instructions

<!-- Its rules convention, with a link to the official docs. Either:
  - its own rules directory (e.g. .youragent/rules/) → strategy rule-drop
  - a shared single file (e.g. AGENTS.md, .goosehints) → strategy block-append
  Note: if it reads AGENTS.md natively, it may already be covered — see the
  "AGENTS.md family" note in INSTALL.md. -->

- Rules path:
- Detection signal (a file/dir or CLI binary that proves it's present):
- Scope: per-project / global

## The change (see CONTRIBUTING.md → "Add an agent in 4 steps")

- [ ] One entry added to `MANIFEST` in `bin/install.js`
- [ ] Row added to the matrix in `INSTALL.md`
- [ ] Verified install → `--doctor` → uninstall round-trip in a temp dir
- [ ] `npm run typecheck && npm test` pass
- [ ] `CHANGELOG.md` `[Unreleased]` entry added

<!-- New contributors welcome — comment to claim this before starting.
     Heads up: a signed CLA is required before merge (the bot will prompt). -->
