# Contributing

Thanks for showing up.

## Before you PR

1. Sign the CLA. The [cla-assistant](https://cla-assistant.io) bot
   prompts on your first PR. **No merges without a signed CLA** —
   branch protection enforces this.
2. Read [`CLA.md`](./CLA.md) (individual contributor) or
   [`CLA-ENTITY.md`](./CLA-ENTITY.md) (you're contributing on behalf
   of a company) before signing.
3. Open an issue first for substantive changes. The receipt rule
   (`src/rules/receipt.md`) is opinionated — discuss design before
   coding.
4. Typo fixes still require CLA. No "small change" exception.

## What's welcome

- Bug fixes for things you actually hit
- Tightening of the receipt rule based on real classroom use
- New agent adapters (we ship 24; see "Add an agent" below — a great first PR)
- Honest framing in docs — no overclaim of verifiability

## What's not

- Detection features. Originality scores. AI-probability estimates.
  PromptCite is a disclosure artifact, not a lie detector.
- Telemetry. Phone-home. Install IDs.
- Web app or hosted service backends. Local-only stays local-only.

## Add an agent (a good first PR)

Adding support for an AI agent is the friendliest way to contribute, and
it's usually the agent *you* already use. Thanks to the manifest in
`bin/install.js`, it's a one-line data entry — no new install logic.

**1. Find your agent's rules convention.** Where does it read project
instructions? Two shapes matter:
- Its **own rules directory** (e.g. `.youragent/rules/`) → strategy
  `rule-drop` (we write our own file there; nothing else is touched).
- A **shared single file** it reads (e.g. `AGENTS.md`, `.goosehints`) →
  strategy `block-append` (we surgically add a marked block and preserve
  whatever's already in the file).
Link the official docs for the path in your PR.

**2. Add one entry to `MANIFEST`** in `bin/install.js`. Copy the closest
existing entry. You need: `id`, `name`, `strategy`, a `detect` spec
(`cwdPaths`/`homePaths`/`command` that prove the agent is present), and
the `path`. Per-project writes use `requiresInit: true` + `onMissingInit:
'stub'`.

```js
{ id: 'youragent', name: 'Your Agent', strategy: 'rule-drop', base: 'cwd',
  path: '.youragent/rules/promptcite-receipt.md',
  requiresInit: true, onMissingInit: 'stub', detect: { cwdPaths: ['.youragent'] } },
```

**3. Verify it round-trips** (in a throwaway directory, never your real
config):
```bash
cd "$(mktemp -d)"
node /path/to/promptcite/bin/install.js --only youragent --with-init   # file appears?
node /path/to/promptcite/bin/install.js --doctor                       # shows up-to-date?
node /path/to/promptcite/bin/install.js --only youragent --with-init --uninstall  # gone?
```
For `block-append`, put some existing text in the file first and confirm
it survives both install and uninstall.

**4. Wire up the rest, then open the PR.** Add a row to the matrix in
`INSTALL.md`, run `npm run typecheck && npm test`, add a one-line
`CHANGELOG.md` entry under `[Unreleased]`, and open the PR (the CLA bot
will prompt you). If the agent reads `AGENTS.md`, it may already be
covered — check the `AGENTS.md` family note in `INSTALL.md` first.

## Review

The maintainer reviews. Branch protection requires the `license/cla`
status check. Merge after CLA + visual review.

## Reporting

- Bugs: [GitHub Issues](https://github.com/camadkins/promptcite/issues)
- Security: `security@camadkins.com` (see [`SECURITY.md`](./SECURITY.md))
- Commercial license inquiries: `cam@camadkins.com` (see [`LICENSE-COMMERCIAL`](./LICENSE-COMMERCIAL))
- Maintainer chain of custody: [`MAINTAINERS.md`](./MAINTAINERS.md)
