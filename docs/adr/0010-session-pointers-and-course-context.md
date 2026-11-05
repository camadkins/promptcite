<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# 0010 — Session pointers and course context

**Status:** Accepted
**Relates to:** [ADR 0006](./0006-ledger-outside-the-repository.md), [ADR 0009](./0009-course-policies-from-the-syllabus.md)

## Context

Two gaps showed up once the hook and course files existed.

1. On skill-based agents, PromptCite only knew "this is CSCE 423 work" when
   `/receipt` ran. In an ordinary prompt the agent had no idea the student had
   written down that class's AI rules.
2. A student who runs `/receipt` late, after the agent compacted or cleared its
   context, loses what happened earlier. The ledger only sees file insertions,
   and plenty of real AI use (explaining, brainstorming, debugging) never
   becomes one.

Claude Code and Codex already keep the full session transcript on disk, and
their hook payloads carry `session_id` and `transcript_path`. Compaction
changes what is in the model's context, not that file. So the conversation
already exists, in the agent's own folder. PromptCite does not need to store it.

## Decision

**Store a pointer, never a copy.** The hook adds one additive `session` event
per `session_id` per ledger, holding the session id, the transcript path, the
tool, and a timestamp. It never reads or stores anything from inside the
transcript. The ledger stays outside the repository and keeps its normal
lifecycle: consumed by `/receipt`, expired after `ttl_days`.

**The hook handles three events now:** PostToolUse (as before, plus the
pointer), UserPromptSubmit (course context, plus the pointer), and SessionStart
after a compact, resume or clear (a short note that earlier transcripts are
listed in the ledger). All of them still exit 0 on any error, make no network
calls, and use no dependencies. None can block or approve anything.

**`/receipt` reads the transcripts, with the student there.** When the ledger
has session pointers for the folder, the rule tells the agent to read those
files to reconstruct AI use across the whole assignment. The receipt keeps the
existing rules: summarized in the student's terms, never the transcript pasted
in unless the student chose the `full_transcript` appendix. If a file is gone,
the agent says so and asks the student.

**Course context writes nothing.** On UserPromptSubmit the hook matches the
prompt against the student's own course files (id, name, aliases, ignoring
case, spaces and dashes), or uses the course the folder is bound to, and prints
a short note: the rules, each with its verbatim syllabus quote, the topics the
syllabus left unclear, and the line that silence is not permission. It touches
no file. Course files are already the student's opt-in, so this works whether or
not the ledger is on. Output is capped near 4 KB.

## Why this does not change the "cannot testify against its user" stance

ADR 0006 says PromptCite must be structurally incapable of testifying against
the student who installed it. That still holds:

- The transcript is not a new record. The agent wrote it to its own folder
  whether or not PromptCite exists. We add a path to a ledger that is already
  local, outside any repository, and deletable.
- The pointer is useless to anyone else. It names a file on the student's
  machine and says nothing about what is in it.
- Nothing reads the transcript except `/receipt`, run by the student, for the
  student's own disclosure. There is no scanner, no comparison against what the
  student says, no number produced. The "never use it to challenge the student"
  rule applies to transcripts exactly as it does to the ledger.
- The student can still switch recording off (`"enabled": false`), and then no
  pointer is written.

## Consequences

- `ledger.schema.yaml` gains an optional `type` field and a `session` event.
  Existing events have no `type` and read as insertions. Readers skip types
  they don't know (ADR 0003).
- The ledger now holds one absolute path per session. Unlike `file`, it points
  outside the project, because that is where the agent keeps transcripts.
- `claude-hook` and `codex-hook` register three events. Uninstall removes only
  our entries from all of them.
- A transcript is the agent's own format and can change. If a file can't be
  read, `/receipt` falls back to asking the student. Nothing depends on it.
