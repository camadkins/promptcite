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
| [0005](./0005-single-session-scope.md) | One receipt covers one session | Accepted |
