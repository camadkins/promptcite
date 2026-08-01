# Example — Multi-session receipt (schema 2.0)

A sample PromptCite receipt covering **one assignment worked across two
sessions**. The full JSON is in
[`multi-session-receipt.json`](./multi-session-receipt.json). This file renders
it in the forms a student actually pastes into a submission.

**Scenario:** the same English 251 policy-analysis essay. On May 14 the student
used ChatGPT (GPT-4o) to outline the argument. Two days later they hit a bug in a
citation-parsing script for the appendix and used Claude (Claude Sonnet 4.6) to
work out why it dropped the last entry. Neither session produced text or code
they kept.

That is the ordinary shape of a real assignment, and it is what schema 2.0
exists for: `ai_use` is an **ordered array of sessions**, so one receipt covers
the whole assignment instead of one sitting.

The two sessions have **different provenance**, which is exactly why
`metadata_source` moved onto the session. The student ran `/receipt` inside
ChatGPT on the 14th, so that session is `agent_reported`. They added the Claude
session afterwards from their own notes, so it is `student_claimed`. A single
top-level value could not have said both.

---

## Citations (MLA)

Every session gets its own citation — a citation names one prompt, one tool, one
model, one date. Both go in your Works Cited.

```
1. "Structure for an essay arguing against a carbon tax." prompt.
   *ChatGPT*, GPT-4o version, OpenAI, 14 May 2026.

2. "Why my citation-parsing script drops the last entry." prompt.
   *Claude*, Claude Sonnet 4.6 version, Anthropic, 16 May 2026.
```

APA, Chicago, IEEE, and Harvard are stored for both sessions too — the student
picks one style; the others are there if the instructor prefers a different one.

## Disclosure paragraph

**One paragraph, not one per session.** Paste it in your paper's header or
acknowledgments:

> I used ChatGPT (GPT-4o) on May 14, 2026 to outline the argument for this
> paper, and my submission loosely followed that structure. On May 16 I used
> Claude (Claude Sonnet 4.6) to debug the citation-parsing script in the
> appendix, which explained what was wrong without generating code I kept. None
> of the AI-generated text appears in the final submission. I rewrote the
> outline in my own words and fixed the parsing bug myself once I understood it.
> The May 14 session was recorded inside ChatGPT; the May 16 details are from my
> own notes.

Note what the paragraph does *not* say: it never states a session count. Two
disclosed sessions are not "more AI use" than one — describing the work is the
point, tallying it is not.

## JSON receipt

See [`multi-session-receipt.json`](./multi-session-receipt.json). Verify it the
same way as any other receipt:

```bash
npx -y github:camadkins/promptcite promptcite-verify multi-session-receipt.json
```

The verifier prints one line per session with its own provenance, and reports the
schema generation it found. It reads schema 1.x receipts too — an older receipt
is not malformed, just older.

---

## What this example demonstrates

- **`ai_use` as an array**, ordered oldest first. A single-session receipt is an
  array of one; consumers should not special-case length 1.
- **Per-session `metadata_source`** — `agent_reported` for the session recorded
  inside the tool, `student_claimed` for the one added from memory.
- **Per-session `citations`** — `citations.mla`, not `outputs.citation_mla`. The
  `citation_` prefix is gone in 2.0.
- **A per-session `appendix`** — the `diff_or_test_log` hangs off the debug
  session only, because that is the conversation it came from. The outline
  session has no appendix.
- **One `outputs.disclosure_statement`** covering both sessions. `outputs` holds
  nothing else in 2.0.
- **Mixed provenance handled honestly** — the paragraph says which session was
  recorded live and which came from notes, rather than claiming agent
  verification for both.

## How a second session gets added

The student did not create this file by hand. They ran `/receipt` on the 14th,
which wrote a one-session receipt. On the 16th they ran `/receipt` again in the
same directory; it found the existing receipt for this assignment and offered to
add the session to it. **Nothing was overwritten.**

If the first receipt had been schema 1.x, adding a session would have upgraded it
to 2.0 in place — `ai_use` becomes `ai_use[0]`, top-level `metadata_source` moves
onto it, `outputs.citation_*` become `ai_use[0].citations.*`. Mechanical and
lossless. See [`docs/SCHEMA-CHANGELOG.md`](../docs/SCHEMA-CHANGELOG.md) for the
field-by-field mapping and
[`docs/adr/0007-multi-session-receipts.md`](../docs/adr/0007-multi-session-receipts.md)
for why.

## Compare with the single-session example

[`brainstorm-receipt.md`](./brainstorm-receipt.md) is a schema **1.1** receipt,
kept deliberately as a backwards-compatibility fixture. Both are valid; the
verifier accepts either.
