<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->
---
code: en
name: English
status: reviewed
---

# English disclosure strings

This is the reference file. Every other language copies its keys. See
`README.md` in this folder before adding a language.

Rules for every file in this folder:

- Keep each `## key` heading exactly as written. Only translate the text under it.
- Keep every `{placeholder}` exactly as written, braces included. The agent fills them in.
- Lines starting with `>` are notes for translators. They never reach the student.

## brainstorm.lead
I used {tool} ({model}) on {date} to brainstorm {summary} for this assignment.

> {summary} is a short noun phrase, e.g. "thesis angles for a policy essay".

## brainstorm.content_not_used
No AI-generated text appears in the final submission.

## brainstorm.content_used
Approximately {percent} of the brainstorm appears verbatim in the submission.

> {percent} is written with its sign, e.g. "20%".

## outline.lead
I used {tool} ({model}) on {date} to outline {topic} for this assignment.

## outline.followed_closely
The structure of my submission followed the AI's outline closely.

## outline.followed_loosely
The structure of my submission loosely followed the AI's outline.

## outline.not_followed
The structure of my submission did not follow the AI's outline.

## outline.content_not_used
No AI-generated text appears verbatim.

## outline.content_used
Some text from the outline appears in the submission.

## search.lead
I used {tool} ({model}) on {date} to search for {sources}.

> {sources} describes the kind of sources or information, e.g. "peer-reviewed studies on crop yields".

## search.verified
I independently verified those sources against {verified_against}.

> {verified_against} is where the student checked, e.g. "the course readings" or "library databases".

## search.not_verified
I did not independently verify those sources; consult them directly before relying on any referenced claim.

## search.cited
The sources are cited in this submission's bibliography directly, not through the AI.

## explain.lead
I used {tool} ({model}) on {date} to have {concept} explained.

## explain.content
No AI-generated content appears in the final submission.

## edit.lead
I used {tool} ({model}) on {date} to edit {portion}.

> {portion} is the part of the work, e.g. "the introduction".

## edit.scope_grammar
The AI only fixed small issues like grammar and spelling.

## edit.scope_rewrote
The AI rewrote paragraphs.

## edit.scope_restructured
The AI restructured the argument.

## edit.scope_voice
The AI changed the voice of the writing.

## edit.content_not_used
No AI-rewritten text appears verbatim.

## edit.content_used
Some AI-rewritten text appears in the submission.

## debug.lead
I used {tool} ({model}) on {date} to debug {problem}.

> {problem} is what was broken, e.g. "a null pointer exception in the data processor".

## debug.explained_only
The AI only explained what was wrong.

## debug.code_kept
The AI generated code I kept.

## debug.code_modified
The AI generated code I modified before keeping.

## draft.lead
I used {tool} ({model}) on {date} to draft {section}.

## draft.verbatim
Approximately {percent} appears verbatim in the final submission.

## draft.verified
I independently verified the factual claims against {verified_against}.

## provenance.agent_reported
This receipt was generated inside {tool} itself, so the tool, model, and date fields above were agent-verified rather than student-reported.

## multi.content_not_used
None of the AI-generated text appears in the final submission.

## multi.mixed_provenance
The {date_recorded} session was recorded inside {tool}; the {date_reported} details are from my own notes.

> Used when some sessions were recorded inside the tool and some were reported by the student from memory.
