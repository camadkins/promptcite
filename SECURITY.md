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

PromptCite is a local-first installer, a markdown rule file, and a few small
command-line tools. The attack surface is intentionally minimal:

- **No network calls** from anything PromptCite ships, once installed. The
  install scripts download PromptCite itself, and the installer may invoke an
  agent's own CLI (for example to register a Gemini extension).
- **No telemetry** of any kind, and zero runtime dependencies.
- **No data leaves the student's machine** except artifacts the student
  themselves produces and hands over (receipts, citations, disclosures,
  declarations, timelines).
- **File writes, all local and documented:**
  - the installer, to documented agent config directories (e.g. `~/.claude/`,
    `~/.cursor/`, `.github/`) and, with `--with-init`, the current directory,
    plus the help docs in `~/.promptcite/help/`;
  - the optional hook, to the ledger in `~/.promptcite/ledgers/` and, only when
    the student turns markers on, a one-line marker comment in a file the agent
    just edited;
  - course files in `~/.promptcite/courses/`, only after the student approves;
  - `promptcite timeline` and `promptcite policy init`, to the current
    directory, never over an existing timeline.
- **Subprocesses:** `promptcite timeline` runs `git log` through `execFile`
  with an argument array (no shell), with external diff, textconv, and
  signature display turned off so repository config can't attach a command to
  it. The installer, `--list`, and `--doctor` run `command -v <agent>` through
  a shell to detect agents (the names are fixed in the installer, never user
  input), and the installer may run an agent's own CLI.

In-scope concerns we take seriously:

- **Prompt-injection of the `/receipt` interview.** A malicious context or
  prior message that hijacks the receipt-generation flow.
- **Path traversal** in the installer's file-write logic.
- **Settings.json corruption** during the JSONC merge.
- **The hook writing somewhere it shouldn't**, or a marker landing inside a
  string and changing a program's behavior.
- **Timeline chain weaknesses** beyond the documented limit (a student can
  recompute the chain after editing; see ADR 0015).

Out-of-scope (per design):

- AI-content detection accuracy — PromptCite is not a detector.
- Verification of student-authored fields — receipts are self-disclosure
  artifacts, not lie detectors.

## Patch and disclosure

Critical fixes are merged via the standard PR flow. Once the fix lands on `main`, a release note discloses the
issue, credits the reporter (if they consented), and recommends the
upgrade.

## Patches go through PRs

All security patches, including the maintainer's own, go through pull
requests. **No direct-to-main commits**, even for security fixes. Branch
protection enforces this, and the audit trail depends on it.
