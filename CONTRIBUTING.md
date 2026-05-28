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
- New agent adapters (we ship four real ones; the long tail is stubbed)
- Honest framing in docs — no overclaim of verifiability

## What's not

- Detection features. Originality scores. AI-probability estimates.
  PromptCite is a disclosure artifact, not a lie detector.
- Telemetry. Phone-home. Install IDs.
- Web app or hosted service backends. Local-only stays local-only.

## Review

The maintainer reviews. Branch protection requires the `license/cla`
status check. Merge after CLA + visual review.

## Reporting

- Bugs: [GitHub Issues](https://github.com/camadkins/promptcite/issues)
- Security: `security@camadkins.com` (see [`SECURITY.md`](./SECURITY.md))
- Commercial license inquiries: `cam@camadkins.com` (see [`LICENSE-COMMERCIAL`](./LICENSE-COMMERCIAL))
- Maintainer chain of custody: [`MAINTAINERS.md`](./MAINTAINERS.md)
