# Changelog

All notable changes to this project documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

(nothing pending)

## [1.0.0] — 2026-05-28

The MVP. Cross-agent `/receipt` skill + dual-license + CLA
infrastructure + supply-chain hardening, all shipped together.

### Added

**The product**
- `/receipt` slash command available across 10 AI coding/writing
  agents via native install paths (no registry dependency for v1.0)
- Receipt outputs: MLA 9 / APA 7 / Chicago 17 citation strings,
  plain-language disclosure paragraph, structured JSON receipt
  validated against `src/schema.yaml`
- Seven `use_category` values: brainstorm, outline, draft, edit,
  debug, explain, search
- **Step 0 provenance gate** with `metadata_source` field
  (`agent_reported` when the AI fills its own tool/model/date,
  `student_claimed` when the student types them in)
- Token-clumped interview flow — brainstorm path drops from 11 turns
  to ~5 with no information loss

**Install matrix (10 native adapters)**
- **Global install:** Claude Code (`~/.claude/skills/promptcite/SKILL.md`),
  Gemini CLI (`gemini extensions install <repo>`)
- **`--with-init` per-project rule-file drops:** Cursor, Windsurf,
  Cline, Continue, Roo Code
- **`--with-init` surgical-block append:** GitHub Copilot
  (`.github/copilot-instructions.md`), Codex CLI (`AGENTS.md`),
  Aider (`CONVENTIONS.md`)
- One-liner install for macOS / Linux / WSL / Git Bash
  (`curl … | bash`) and Windows PowerShell (`irm … | iex`)
- Installer flags: `--dry-run`, `--only <id>`, `--all`, `--with-init`,
  `--uninstall`, `--non-interactive`, `--no-color`, `--config-dir`,
  `--force`, `--list`, `--version`, `--help`
- `--all` filters by `detect()` — only installs for agents actually
  present on the user's machine

**Licensing & contributor governance**
- AGPL-3.0-only community license + commercial license available
  (`LICENSE-COMMERCIAL`)
- Harmony Agreement HA-CLA-I-LIST 1.0 for individual contributors
  (`CLA.md`)
- Harmony Agreement HA-CLA-E stub for entity contributors
  (`CLA-ENTITY.md`)
- CLA Assistant bot live and enforced via required status check
- Maintainer chain of custody in `MAINTAINERS.md`

**CI/CD pipeline**
- 7 GitHub Actions workflows: `ci.yml`, `pr-checks.yml`, `release.yml`,
  `scorecard.yml`, `codeql.yml`, `dependabot.yml`, `CODEOWNERS`
- PR-checks bot — project-specific checklist; sticky comment shows only
  failures/warnings (or "looks good"), never exposes passed checklist
- 8 required status checks on `main` (license/cla, Typecheck,
  Install dry-run × 2 OS, Gemini extension manifest valid,
  GEMINI.md synced, PR checklist, Analyze JavaScript)
- Release workflow auto-creates GitHub Release on `v*` tag push with
  sigstore build-provenance attestation (verifiable via
  `gh attestation verify`)
- OSSF Scorecard runs weekly + on push for supply-chain hygiene
- CodeQL static analysis on every PR + weekly
- Dependabot weekly updates for npm devDeps + GitHub Actions versions
- All TypeScript / @types/node / GitHub Action major versions on
  current (TS 6.0.3, @types/node 25.x, actions/checkout v6, etc.)

**Documentation**
- `README.md` — project overview, status, install, license summary
- `INSTALL.md` — per-agent install matrix with concrete commands
- `NOTICE.md` — plain-English dual-license summary
- `SECURITY.md` — vulnerability reporting + threat model
- `MAINTAINERS.md` — chain of custody
- `CONTRIBUTING.md` — contributor guide, CLA flow, scope
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1 (reference)
- `docs/for-instructors.md` — instructor-facing receipt-reading guide
- `examples/brainstorm-receipt.{json,md}` — sample receipt artifact

### Known limits (intentional)

- The receipt JSON is **locally editable** after generation.
  `metadata_source` is a transparency marker, not a tamper-proof
  signature. PromptCite v1.0 has no server-side signing, transparency
  log, or instructor-side verification — that's future-direction
  integration work, out of scope for v1.0.
- Long-tail agents beyond the 10 in the matrix are not yet supported.
  The vercel-labs/skills registry submission is deferred until the
  project has earned the maintainer time of other devs.
- English-only receipt output. Non-English disclosure templates are
  post-v1.0.
- Multi-session receipt aggregation is not supported — students
  needing to disclose AI use across multiple sessions run `/receipt`
  per session and combine manually.

### Security

- Repo branch protection: `enforce_admins=true`, no force-pushes,
  no deletions, `dismiss_stale_reviews=true`, all 8 required checks
- Solo collaborator (maintainer); CLA bot blocks merges from any
  external contributor without a signed CLA
- Sigstore build-provenance attestation on tagged releases — users
  can verify the release tarball wasn't tampered with via
  `gh attestation verify`
- Zero runtime dependencies in the installer (Node built-ins only)
- No telemetry, no analytics, no install IDs, no phone-home
