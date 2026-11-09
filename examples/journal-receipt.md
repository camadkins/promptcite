# Example — Journal declaration

A sample PromptCite receipt at schema 2.2. The full JSON is in
[`journal-receipt.json`](./journal-receipt.json).

**Scenario:** a graduate student is writing a manuscript for an Elsevier
journal as part of AGRO 896. Early on they brainstormed with ChatGPT from
memory, and later they asked Claude to tighten the discussion section. Their
settings have `"extra_statements": ["journal"]`, so `/receipt` wrote the
journal form next to the usual paragraph.

---

## Journal declaration

> **Declaration of generative AI and AI-assisted technologies in the
> manuscript preparation process**
>
> During the preparation of this work the author used ChatGPT (GPT-4o) and
> Claude (Claude Sonnet 4.6) in order to brainstorm explanations for lower
> soil moisture under rye and tighten the wording of the discussion section.
> After using this tool/service, the author reviewed and edited the content
> as needed and takes full responsibility for the content of the publication.

## Disclosure paragraph

> I used ChatGPT (GPT-4o) on October 28, 2026 to brainstorm possible
> explanations for lower soil moisture under rye for this assignment. On
> November 6 I used Claude (Claude Sonnet 4.6) to edit the discussion
> section, where the AI rewrote paragraphs; a few lines of AI-generated text
> appear in the final submission, and I edited that text before keeping it. I
> accepted about half of the suggested cuts and rewrote the rest myself. The
> November 6 session was recorded inside Claude; the October 28 details are
> from my own notes.

---

## What this example demonstrates

- **Elsevier's wording, filled in.** The heading and both sentences are the
  journal policy's own text (updated June 2026). PromptCite fills in the tools
  and the reasons, and resolves "author(s)" to one author.
- **One declaration for the whole receipt.** Both sessions are in it, each
  tool once with its model. Nothing in it goes past what the sessions record.
- **The paragraph is still there.** The journal form is an extra, never a
  replacement. The course still gets the full disclosure.
- **Stored without the heading.** `outputs.journal_statement` holds the
  statement; the heading is added when it's shown.

If the journal has its own required wording, the student pastes it and
PromptCite uses that instead. See [ADR 0014](../docs/adr/0014-other-forms-and-the-no-ai-declaration.md).
