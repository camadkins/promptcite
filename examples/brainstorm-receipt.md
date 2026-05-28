# Example — Brainstorm receipt

A sample PromptCite receipt. The full JSON is in
[`brainstorm-receipt.json`](./brainstorm-receipt.json). This file
renders it in the three forms a student actually pastes into a
submission.

**Scenario:** an English 251 student finished a policy-analysis
essay. They used ChatGPT (GPT-4o) on May 14 to brainstorm
counterarguments to carbon tax policies. None of ChatGPT's text
appears in the final submission — the student used the brainstorm
as scaffolding for their own outline, then wrote in their own words.

They ran `/receipt` from inside ChatGPT after finishing, so the
`metadata_source` is `agent_reported` — ChatGPT filled in its own
tool/model/date.

---

## Citation (MLA)

```
"Counterarguments to carbon tax policies." prompt. *ChatGPT*,
GPT-4o version, OpenAI, 14 May 2026.
```

Drop this in your Works Cited.

## Citation (APA)

```
OpenAI. (2026). ChatGPT (GPT-4o version) [Large language model].
```

## Citation (Chicago — notes-bibliography)

```
ChatGPT, GPT-4o, response to "Counterarguments to carbon tax
policies," May 14, 2026, OpenAI.
```

## Disclosure paragraph

Paste this in your paper's header or acknowledgments:

> I used ChatGPT (GPT-4o) on May 14, 2026 to brainstorm
> counterarguments to carbon tax policies for this assignment. No
> AI-generated text appears in the final submission. I used the list
> to structure my own outline and rewrote all arguments in my own
> words. This receipt was generated inside ChatGPT itself, so the
> tool, model, and date fields above were agent-verified rather than
> student-reported.

## JSON receipt

See [`brainstorm-receipt.json`](./brainstorm-receipt.json). Attach to
your submission as a file, or paste the JSON block at the end of your
paper.

The receipt includes a `content_hash` field (sha256 of the other
fields, canonically serialized). Instructors can verify the receipt
hasn't been edited:

```bash
npx -y github:camadkins/promptcite promptcite-verify brainstorm-receipt.json
```

Tamper-evident speed bump, not tamper-proof. Honest about its limits.

---

## What this example demonstrates

- A **clean brainstorm path:** no verbatim AI text in the submission,
  student transparently used AI as a scaffolding tool
- The **`agent_reported` metadata path:** the AI filled in its own
  identity, and the disclosure paragraph mentions this for the
  instructor's awareness
- All **three citation styles** generated from one interview pass —
  the student picks one for their paper's style guide; the others are
  there for the instructor if they prefer a different format
- **`source_verification: null`** — brainstorm didn't involve sources,
  so the field stays null. The disclosure paragraph does not include
  a "I independently verified..." sentence for this category.

## Other categories

This is the brainstorm example. The other six `use_category` values
(`outline`, `draft`, `edit`, `debug`, `explain`, `search`) follow the
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
