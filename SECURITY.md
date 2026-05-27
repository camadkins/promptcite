# Security Policy

## Reporting a vulnerability

Security issues in PromptCite should be reported privately, **not** as a
public GitHub issue. Email `security@camadkins.com` with the details.
Expect an acknowledgement within 72 hours.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce (or a proof-of-concept)
- The version or commit SHA where you observed the issue
- Any suggested mitigation

We do **not** currently run a bug bounty program. We will, however,
publicly credit responsible disclosures in the release notes (with your
consent).

## Threat model

PromptCite is a local-first installer and a markdown rule file. The
attack surface is intentionally minimal:

- **No network calls** from the receipt generator itself.
- **No telemetry** of any kind.
- **No data leaves the student's machine** except artifacts the student
  themselves produces (receipt JSON, citation strings, disclosure
  paragraphs).
- **The installer's only file writes** are to documented agent config
  directories (e.g. `~/.claude/`, `~/.cursor/`, `.github/`) and, with
  `--with-init`, to the current working directory.

In-scope concerns we take seriously:

- **Prompt-injection of the `/receipt` interview.** A malicious context or
  prior message that hijacks the receipt-generation flow.
- **Path traversal** in the installer's file-write logic.
- **Settings.json corruption** during the JSONC merge.
- **Supply-chain attacks** via the `npx skills add` fallback path.

Out-of-scope (per design):

- AI-content detection accuracy — PromptCite is not a detector.
- Verification of student-authored fields — receipts are self-disclosure
  artifacts, not lie detectors.

## Patch and disclosure

Critical fixes are merged via the standard PR flow with **CLA signature
required** (enforced by branch protection). Patches must not skip the
CLA bot. Once the fix lands on `main`, a release note discloses the
issue, credits the reporter (if they consented), and recommends the
upgrade.

For "fix urgent" cases where the maintainer alone authors the patch, the
maintainer's own CLA signature on file is sufficient.

## CLA-gated patches

All security patches — including the maintainer's own — flow through
pull requests so the CLA bot can record the signature on the patch
itself. **No direct-to-main commits**, even for security fixes. This is
enforced by branch protection and is non-negotiable: the audit trail's
value depends on it being complete.
