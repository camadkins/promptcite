# Example — Explain receipt

A sample PromptCite receipt. The full JSON is in
[`explain-receipt.json`](./explain-receipt.json). This file
renders it in the three forms a student actually pastes into a
submission.

**Scenario:** an English 251 student was about to write a section
of a policy-analysis essay and first wanted to understand the
topic. They used ChatGPT (GPT-4o) on May 12 to explain how a
carbon tax works and why it is argued to reduce emissions. None
of ChatGPT's text appears in the final submission — the student
used the explanation to understand the concept, then wrote the
section in their own words.

They ran `/receipt` from inside ChatGPT after finishing, so the
`metadata_source` is `agent_reported` — ChatGPT filled in its own
tool/model/date.

---

## Citation (MLA)

```
"How a carbon tax works." prompt. *ChatGPT*,
GPT-4o version, OpenAI, 12 May 2026.
```

Drop this in your Works Cited.

## Citation (APA)

```
OpenAI. (2026). ChatGPT (GPT-4o version) [Large language model].
```

## Citation (Chicago — notes-bibliography)

```
ChatGPT, GPT-4o, response to "How a carbon tax works,"
May 12, 2026, OpenAI.
```

## Disclosure paragraph

Paste this in your paper's header or acknowledgments:

> I used ChatGPT (GPT-4o) on May 12, 2026 to explain how a
> carbon tax works and why it is argued to reduce emissions. No
> AI-generated text appears in the final submission. I used the
> explanation to understand the concept, then wrote the section
> in my own words. This receipt was generated inside ChatGPT
> itself, so the tool, model, and date fields above were
> agent-verified rather than student-reported.

## JSON receipt

See [`explain-receipt.json`](./explain-receipt.json). Attach to
your submission as a file, or paste the JSON block at the end of your
paper.

The receipt includes a `content_hash` field (sha256 of the other
fields, canonically serialized). Instructors can verify the receipt
hasn't been edited:

```bash
npx -y github:camadkins/promptcite promptcite-verify explain-receipt.json
```

Tamper-evident speed bump, not tamper-proof. Honest about its limits.

---

## What this example demonstrates

- A **clean explain path:** the AI explained a concept, the student
  understood it, and no AI-generated text appears in the submission
- The **`agent_reported` metadata path:** the AI filled in its own
  identity, and the disclosure paragraph mentions this for the
  instructor's awareness
- All **three citation styles** generated from one interview pass —
  the student picks one for their paper's style guide; the others are
  there for the instructor if they prefer a different format
- **`source_verification: null`** — explaining didn't involve sources,
  so the field stays null. The disclosure paragraph does not include
  a "I independently verified..." sentence for this category.

## Other categories

This is the explain example. The other six `use_category` values
(`brainstorm`, `outline`, `draft`, `debug`, `edit`, `search`) follow the
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
