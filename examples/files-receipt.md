# Example — File table for code

A sample PromptCite receipt at schema 2.2. The full JSON is in
[`files-receipt.json`](./files-receipt.json).

**Scenario:** a CSCE 310 project with markers turned on. Claude fixed a loop
bound in the student's merge sort, and Copilot drafted a CSV parser the
student then edited. Before writing the receipt, `/receipt` ran
`promptcite-check --files`, showed the two marked files, and asked what the AI
did to each. The student added a third file the AI helped with that had no
marker.

---

## Files (in the JSON and the verify report)

| File | What the AI did (student's answer) | Tools | Listed from |
|---|---|---|---|
| `src/sort.py` | improved code the student wrote | Claude Opus 5 | marker |
| `src/parse.py` | wrote it | Copilot (GPT-4.1) | marker |
| `tests/test_parse.py` | some of each | Copilot (GPT-4.1) | added by the student |

## Disclosure paragraph

> I used Claude (Claude Opus 5) on November 3, 2026 to debug why my merge step
> dropped the last element, and the AI generated code I kept: a few lines of
> AI-generated text appear in the final submission, kept as the AI wrote it. On
> November 4 I used Copilot (GPT-4.1) to draft a CSV line parser that handles
> quoted commas; a section or more of the final submission came from the AI,
> and I edited that text before keeping it. I rewrote the escape handling and
> wrote most of the tests myself. This receipt was generated inside the tools
> themselves, so the tool, model, and date fields above were agent-verified
> rather than student-reported.

---

## What this example demonstrates

- **Markers say where, the student says what.** `promptcite-check --files`
  listed the files and models. Whether each one was written or improved is
  the student's answer, and PromptCite didn't suggest one.
- **No numbers.** No line counts, no marker counts, no share of the file.
  The sessions' `extent` already says roughly how much, in the student's
  words.
- **Unmarked work still goes in.** The test file had no marker, so the
  student added it, and the row says so.
- **One table for the assignment,** across both sessions.

See [ADR 0017](../docs/adr/0017-file-table-for-code.md).
