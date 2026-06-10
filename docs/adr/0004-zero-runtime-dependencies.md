<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0004 — Zero runtime dependencies

**Status:** Accepted

## Context

PromptCite installs into students' and instructors' machines and is meant
for institutional trust. Every runtime dependency is supply-chain surface
and a thing that can break `npx` installs.

## Decision

The installer and verifier use **Node built-ins only** — zero runtime
`dependencies` in `package.json`. devDependencies are limited to TypeScript
(for `tsc --noEmit` JSDoc type-checking) and `@types/node`. CI enforces an
empty `dependencies` object.

## Consequences

- Minimal supply-chain surface; `npx github:camadkins/promptcite` just works.
- No network calls at runtime (ADR 0002 / no-telemetry).
- Trade-off: we hand-roll small utilities (arg parsing via `node:util`,
  schema validation in `bin/verify.js`) rather than pulling libraries. For a
  codebase this size that's a feature, not a burden.
- Tooling that *would* add deps (e.g. Prettier + Husky pre-commit) is a
  deliberate opt-in decision, not a default.
