# Example — Disclosure that cites the course rule

A sample PromptCite receipt at schema 2.2. The full JSON is in
[`course-rule-receipt.json`](./course-rule-receipt.json).

**Scenario:** a CSCE 423 student has a course file made from the syllabus. It
says AI may be used to understand course concepts but not to produce homework
solutions. They asked Claude why case 2 of the master theorem adds a log
factor, then did the homework themselves. Before writing the receipt,
`/receipt` showed them the sentence below and asked whether to cite the rule.
They said yes.

---

## Disclosure paragraph

> Per the CSCE 423 AI policy ("Generative AI tools may be used to help you
> understand course concepts."), I used Claude (Claude Sonnet 4.6) on
> November 4, 2026 to have case 2 of the master theorem explained. No
> AI-generated content appears in the final submission. I worked every
> homework problem myself after the explanation. This receipt was generated
> inside Claude itself, so the tool, model, and date fields above were
> agent-verified rather than student-reported.

## Citation (MLA)

```
"Why case 2 of the master theorem adds a log factor" prompt. *Claude*,
model Claude Sonnet 4.6, Anthropic, 4 Nov. 2026, claude.ai.
```

---

## What this example demonstrates

- **The cited rule is the syllabus's own words**, the first sentence of the
  course file's guidance quote. It is not a paraphrase and not a summary.
- **It's there because the student said yes.** Without that yes, the paragraph
  opens "I used Claude ..." as it always has, and nothing from the course file
  goes into the receipt.
- **Only a rule that allows the use gets cited.** Explaining a concept is what
  this rule allows. A use past the rule, or past an AI level, gets a warning
  and no offer. The [draft example](./draft-receipt.md) shows a student who
  was offered the citation and said no, so the paragraph reads as it always
  has.
- **`extent: none`** renders as the category's usual "No AI-generated content"
  sentence.

See [ADR 0013](../docs/adr/0013-students-may-cite-the-course-rule.md).
