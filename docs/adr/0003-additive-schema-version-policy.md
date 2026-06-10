<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0003 — Additive schema-version policy

**Status:** Accepted

## Context

Universities may adopt the receipt format as a submission standard, so the
contract in `src/schema.yaml` must be stable. We still need room to grow the
format (e.g. new citation fields, `submission_hash` in 1.1).

## Decision

Schema versions follow semver-style breaking-change semantics:
- **`1.x → 1.(x+1)`** may add **optional fields only**. Older receipts stay
  valid; consumers must tolerate absent optional fields.
- **`1.x → 2.0`** may rename, remove, or re-type fields.

Every bump is recorded in [`docs/SCHEMA-CHANGELOG.md`](../SCHEMA-CHANGELOG.md).

## Consequences

- Schema 1.0 receipts remain valid 1.1 receipts (IEEE/Harvard citations and
  `submission_hash` are all optional additions).
- Consumers (including `bin/verify.js`) must treat new fields as optional.
- A genuinely breaking change forces a major bump and a migration note,
  surfacing the cost rather than hiding it.
