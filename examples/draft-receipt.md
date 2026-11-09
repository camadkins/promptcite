# Example — Draft receipt with stage and extent

A sample PromptCite receipt at schema 2.2. The full JSON is in
[`draft-receipt.json`](./draft-receipt.json). This file renders it in the
forms a student actually pastes into a submission.

**Scenario:** an ENGL 150 student is writing a community profile of a
farmers market. On November 2 they asked Claude for ways to organize it and
picked one. On November 5 they had Claude draft the opening paragraph from
their interview notes, kept two of its sentences, rewrote the rest, and caught
a quote it made up.

---

## Citation (MLA)

```
"First draft of my opening paragraph from interview notes" prompt.
*Claude*, model Claude Sonnet 4.6, Anthropic, 5 Nov. 2026, claude.ai.
```

Each session has its own citation. The November 2 one is in the JSON.

## Disclosure paragraph

> I used Claude (Claude Sonnet 4.6) on November 2, 2026 to outline this
> profile, and my submission follows a structure it suggested, with the last
> two sections reordered. On November 5 I used Claude to draft the opening
> paragraph from my interview notes. Two of its sentences appear in my
> opening paragraph; I rewrote the rest. I independently verified the facts
> against my interview notes and replaced a quote the AI made up with a real
> one. Both sessions were recorded inside Claude.

## JSON receipt

See [`draft-receipt.json`](./draft-receipt.json). Check it hasn't been edited:

```bash
npx -y github:camadkins/promptcite promptcite-verify draft-receipt.json
```

---

## What this example demonstrates

- **`stage`** on each session: the outline was `planning`, the paragraph was
  `drafting`. `category` says what the AI did; `stage` says when.
- **`extent`**: the outline session put `none` of the AI's text in the
  submission. The draft session put in a `small` share, which the student
  `reworked`. `direct_content_used` is still the plain yes/no on verbatim text.
- **`verification.methods`**: the student says they read it through and
  checked the sources, and the statement says what they found.
- None of this is measured. The student picked every value, and the verifier
  only checks that the picks are from the list and agree with each other.

See [`src/schema.yaml`](../src/schema.yaml) for the field definitions and
[ADR 0012](../docs/adr/0012-stage-and-extent.md) for why they are closed lists.
