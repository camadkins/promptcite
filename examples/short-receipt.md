# Example — Short statement for an LMS comment box

A sample PromptCite receipt at schema 2.2. The full JSON is in
[`short-receipt.json`](./short-receipt.json).

**Scenario:** a CSCE 156 lab asks students to note any AI use in the Canvas
submission comment. The student asked Copilot why their linked-list remove
left a dangling tail pointer, then fixed it themselves. They asked for "the
short version too", so `/receipt` wrote a one-line form next to the
paragraph.

---

## Short statement

> I used Copilot (GPT-4.1) on this assignment to debug a dangling tail
> pointer. My AI-use receipt has the details.

## Disclosure paragraph

> I used Copilot (GPT-4.1) on November 5, 2026 to debug why removing the last
> node left a dangling tail pointer. The AI only explained what was wrong. I
> fixed the tail update myself once I saw the problem. This receipt was
> generated inside Copilot itself, so the tool, model, and date fields above
> were agent-verified rather than student-reported.

---

## What this example demonstrates

- **One line, under 300 characters.** It fits a comment box and points at the
  receipt for the rest. The verifier rejects a longer one.
- **Same facts, fewer words.** The tool, model, and use come from the
  session. Provenance, stage, extent, and methods stay in the JSON.
- **Ask once or set it.** `"extra_statements": ["short"]` in
  `promptcite.config.json` writes it every time.

See [ADR 0014](../docs/adr/0014-other-forms-and-the-no-ai-declaration.md).
