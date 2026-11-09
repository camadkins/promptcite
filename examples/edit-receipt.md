# Example — Edit receipt

A sample PromptCite receipt. The full JSON is in
[`edit-receipt.json`](./edit-receipt.json). This file
renders it in the three forms a student actually pastes into a
submission.

**Scenario:** an English 251 student finished a first draft of a
policy-analysis essay. They used ChatGPT (GPT-4o) on May 16 to edit
the draft, asking for grammar, punctuation, and phrasing fixes.
They reviewed each suggestion and applied only small fixes —
grammar, punctuation, and word choice. They did not restructure
the essay or change its voice, and none of ChatGPT's rewritten
sentences appear in the final submission.

They ran `/receipt` from inside ChatGPT after finishing, so the
`metadata_source` is `agent_reported` — ChatGPT filled in its own
tool/model/date.

---

## Citation (MLA)

```
"Grammar, punctuation, and phrasing fixes for my policy analysis
essay draft." prompt. *ChatGPT*, GPT-4o version, OpenAI, 16 May 2026.
```

Drop this in your Works Cited.

## Citation (APA)

```
OpenAI. (2026). ChatGPT (GPT-4o version) [Large language model].
```

## Citation (Chicago — notes-bibliography)

```
ChatGPT, GPT-4o, response to "Grammar, punctuation, and phrasing
fixes for my policy analysis essay draft," May 16, 2026, OpenAI.
```

## Disclosure paragraph

Paste this in your paper's header or acknowledgments:

> I used ChatGPT (GPT-4o) on May 16, 2026 to edit my draft of the
> policy analysis essay. I applied only small fixes — grammar,
> punctuation, and word choice — and did not restructure the essay
> or change its voice. No AI-rewritten sentences appear in the
> final submission. I reviewed each suggested fix and kept only
> the ones I agreed with. This receipt was generated inside
> ChatGPT itself, so the tool, model, and date fields above were
> agent-verified rather than student-reported.

## JSON receipt

See [`edit-receipt.json`](./edit-receipt.json). Attach to
your submission as a file, or paste the JSON block at the end of your
paper.

The receipt includes a `content_hash` field (sha256 of the other
fields, canonically serialized). Instructors can verify the receipt
hasn't been edited:

```bash
npx -y github:camadkins/promptcite promptcite-verify edit-receipt.json
```

Tamper-evident speed bump, not tamper-proof. Honest about its limits.

---

## What this example demonstrates

- A **clean small-fix edit path:** grammar, punctuation, and word
  choice only — no restructuring, no change of voice, no
  AI-rewritten sentences in the submission
- The **`agent_reported` metadata path:** the AI filled in its own
  identity, and the disclosure paragraph mentions this for the
  instructor's awareness
- All **three citation styles** generated from one interview pass —
  the student picks one for their paper's style guide; the others are
  there for the instructor if they prefer a different format
- **`source_verification: null`** — editing didn't involve sources,
  so the field stays null. The disclosure paragraph does not include
  a "I independently verified..." sentence for this category.

## Other categories

This is the edit example. The other six `use_category` values
(`brainstorm`, `outline`, `draft`, `debug`, `explain`, `search`) follow the
same structural pattern but with different category-specific prompts
and different optional fields:

- `draft` typically includes a `share_link_or_excerpt` for
  higher-stakes writing
- `debug` may include a `diff_or_test_log` appendix for code
  assignments
- `search` always includes `source_verification` (required for that
  category)

See [`src/rules/receipt.md`](../src/rules/receipt.md) for the full
interview rule and category-specific output templates.
