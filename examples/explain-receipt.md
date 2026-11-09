# Example — Explain receipt

A sample PromptCite receipt at schema 2.2. The full JSON is in
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
"How a carbon tax works" prompt. *ChatGPT*, model GPT-4o,
OpenAI, 12 May 2026, chatgpt.com.
```

Drop this in your Works Cited.

## Citation (APA)

```
OpenAI. (2026). *ChatGPT* [Large language model].
https://chatgpt.com/
```

## Citation (Chicago — notes-bibliography)

```
Response to "How a carbon tax works," ChatGPT GPT-4o, OpenAI,
May 12, 2026.
```

Use this as a footnote. Chicago usually leaves AI output out of the
bibliography.

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
- All **five citation styles** (MLA, APA, Chicago, IEEE, Harvard) are
  stored on the session from one interview pass. Three are shown above;
  the student pastes the one their course uses, and the instructor can
  use any of the others
- **`source_verification: null`** — explaining didn't involve sources,
  so the field stays null. The disclosure paragraph does not include
  a "I independently verified..." sentence for this category.
- **`extent: none`**: no AI text appears in the submission, so there is
  no `student_change`

## Other categories

This is the explain example. Others in this folder: [brainstorm](./brainstorm-receipt.md)
(kept at schema 1.1 to show older receipts still verify), [draft](./draft-receipt.md),
[search with an unconfirmed source](./sources-receipt.md), [code with a file
table](./files-receipt.md), [several sessions](./multi-session-receipt.md), and
[a reflection](./reflection-receipt.md).

See [`src/rules/receipt.md`](../src/rules/receipt.md) for the full
interview rule and category-specific output templates.
