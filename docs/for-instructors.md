# PromptCite for Instructors

This page is for **instructors** — professors, TAs, academic-integrity
officers. You don't install PromptCite; your students do. Your job is
reading the receipts they submit.

## What you receive

A student who completed an assignment with PromptCite-disclosed AI use
will hand you, alongside their paper or code:

1. **A disclosure paragraph** pasted into the submission's header or
   acknowledgments (~2–4 sentences)
2. **A formatted citation** in the assignment's required style
   (MLA / APA / Chicago)
3. **A JSON receipt** as an attachment or pasted appendix

You don't need any software to read these. The disclosure and citation
are plain text. The JSON is structured and human-readable.

## How to read the JSON receipt

The receipt fields follow [`src/schema.yaml`](../src/schema.yaml).
Required structure:

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-05-27T14:30:00Z",
  "metadata_source": "agent_reported" | "student_claimed",
  "student": "<name or ID>",
  "assignment": { "course": "...", "instructor": "...", "title": "..." },
  "ai_use": {
    "tool": "...", "model": "...", "date": "YYYY-MM-DD",
    "category": "brainstorm|outline|draft|edit|debug|explain|search",
    "prompt_summary": "<student-written summary>",
    "direct_content_used": true | false,
    "revision_statement": "<student-written>",
    "source_verification": true | false | null
  },
  "outputs": { "citation_mla": "...", "citation_apa": "...",
                "citation_chicago": "...", "disclosure_statement": "..." }
}
```

## The `metadata_source` field — what it tells you

This is the most important field for your reading.

### `"agent_reported"`

The student ran `/receipt` **inside the AI they're disclosing**. The
AI itself filled in `tool`, `model`, and `date` based on its own
self-knowledge. The student did not type those fields.

**What this tells you:** the student didn't have to remember which
model version they used or look up the date. Reduced friction for
honest disclosure. The AI confirmed its own identity at generation
time.

**What this does NOT tell you:** after the JSON was generated, it
landed on the student's local disk as an editable file. The student
could have edited any field before submitting to you. PromptCite v1
has no cryptographic signing or transparency log to make this
tamper-resistant. Treat `agent_reported` as a transparency marker,
not a forensic proof.

### `"student_claimed"`

The student ran `/receipt` outside the AI they're disclosing — for
example, they used ChatGPT yesterday and ran `/receipt` in Claude
today to file the disclosure. The student typed in `tool`, `model`,
and `date` from memory.

**What this tells you:** treat the metadata fields the same way you'd
treat a citation the student wrote by hand. Plausible-on-its-face;
not independently verified.

### Either way

The **content fields** — `prompt_summary`, `direct_content_used`,
`revision_statement`, `source_verification` — are always
student-authored. PromptCite captures what the student writes; it
does not interpret or verify it.

## Use categories — what to look for per category

The student picked one of seven `use_category` values. Here's what
each typically signals and what to scan for in the receipt:

| Category | What it means | What to look for |
|---|---|---|
| `brainstorm` | Used AI to generate ideas, counterarguments, possibilities | `direct_content_used` should usually be `false`. Revision statement should describe how the student used the brainstorm to structure their own work. |
| `outline` | Asked AI to outline a paper, project, or argument | Check whether the student says the structure "followed", "loosely followed", or "did not follow" the AI's outline. |
| `search` | Used AI to find sources or background information | **`source_verification` should be `true`.** The student should have independently verified the sources. Cited in the submission's bibliography directly, not via the AI. |
| `explain` | Asked AI to explain a concept the student didn't keep in the submission | `direct_content_used` should be `false`. Useful signal that AI was a learning tool, not a writing tool. |
| `edit` | Asked AI to edit, reword, or improve existing student work | Check whether the student says the AI "only fixed small issues" vs "rewrote paragraphs / changed voice / restructured." |
| `debug` | Used AI to find or fix errors in code or logic | Check whether the student says the AI "only explained" or "generated code I kept." For high-stakes assignments, a diff/test-log appendix may be attached. |
| `draft` | Used AI to draft prose, code, or content that may appear in the submission | This is the highest-disclosure category. Check the percentage of verbatim content, the revision statement, and whether a share link or excerpt is attached for higher-stakes writing. |

## Setting an AI policy that references receipts

If you'd like to require receipts as part of your assignment policy,
some patterns that work:

**Per-assignment policy:**
> "AI use on this assignment must be disclosed via a PromptCite
> receipt (see promptcite.io/install). Receipts should accompany the
> submission as a JSON attachment. Failure to disclose AI use is
> treated as a violation of the course's academic integrity policy."

**Tiered policy by category:**
> "Brainstorming, explaining, and searching with AI are permitted for
> all assignments and require a core receipt. Outlining and editing
> require a core receipt plus a revision statement. Drafting and
> debugging require a core receipt plus a share-link or diff appendix."

**Policy that PromptCite explicitly does not support:**
> ❌ "Submit a PromptCite receipt to verify your AI use." — PromptCite
> does not verify anything. It is a disclosure artifact, not a
> verification mechanism. A student who lies on the receipt produces
> an inaccurate receipt; PromptCite cannot catch that. The same
> limitation applies to citations.

## Limitations to be aware of

- **Local-editability:** as noted above, the JSON is editable after
  generation. PromptCite v1 has no signing or transparency log.
- **Self-disclosure, not detection:** PromptCite never tries to
  determine whether a student used AI. It records what the student
  declares.
- **English-only output:** receipt language is English. Non-English
  disclosure templates may come later.
- **One session per receipt:** a student who used AI across multiple
  sessions for one assignment runs `/receipt` once per session and
  combines manually. Receipt aggregation is not built in.

## Reporting issues with the schema

If you're a department or institution adopting PromptCite at scale
and the receipt schema doesn't fit your governance review, file an
issue at https://github.com/camadkins/promptcite/issues. Schema
changes follow semver; v1.x receipts will remain readable.

For commercial license inquiries (universities deploying PromptCite
institutionally), see [`LICENSE-COMMERCIAL`](../LICENSE-COMMERCIAL).
