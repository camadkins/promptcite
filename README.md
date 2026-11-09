# PromptCite

> Cross-agent `/receipt` for honest AI use disclosure on student work.

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL_v3-blue.svg)](./LICENSE)
[![CI](https://github.com/camadkins/promptcite/actions/workflows/ci.yml/badge.svg)](https://github.com/camadkins/promptcite/actions/workflows/ci.yml)
[![CodeQL](https://github.com/camadkins/promptcite/actions/workflows/codeql.yml/badge.svg)](https://github.com/camadkins/promptcite/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/camadkins/promptcite)](https://github.com/camadkins/promptcite/releases)
[![OSSF Scorecard](https://api.scorecard.dev/projects/github.com/camadkins/promptcite/badge)](https://scorecard.dev/viewer/?uri=github.com/camadkins/promptcite)

## Install

**macOS, Linux, WSL, Git Bash**

```bash
curl -fsSL https://raw.githubusercontent.com/camadkins/promptcite/main/install.sh | bash
```

**Windows (PowerShell 5.1+)**

```powershell
irm https://raw.githubusercontent.com/camadkins/promptcite/main/install.ps1 | iex
```

Or with Node 18+ on any system: `npx -y github:camadkins/promptcite`.

It finds the supported AI agents on your machine and adds `/receipt` to each.
Safe to re-run. Per-agent commands and flags are in [INSTALL.md](./INSTALL.md).
Then:

```bash
promptcite help student       # the short path for students
promptcite help instructor    # the short path for instructors
```

## What it is

PromptCite adds one command, `/receipt`, to 26 AI coding and writing agents
(Claude Code, Gemini CLI, Cursor, Windsurf, Codex, Copilot, Cline, Continue,
Roo, Aider, Amazon Q, Kiro, Augment, Trae, JetBrains Junie, Goose, Replit,
OpenHands, Qodo, Zed, opencode, Amp, Crush, GitHub Copilot CLI, Factory Droid,
Jules), plus any other `AGENTS.md`-aware agent, and anything else through
`promptcite --print-rule`.

After AI-assisted work, a student runs `/receipt`, answers a few short
questions, and gets three things to hand in:

- A **citation** in MLA, APA, Chicago, IEEE, or Harvard.
- A plain-language **disclosure paragraph** for the paper's header.
- A **JSON receipt** an instructor can check hasn't been edited.

It is not an AI detector and produces no scores. It records what the student
says, and only what they confirm. It never blocks: a student who used AI
where a course doesn't allow it still gets an honest receipt, with the rule
quoted next to it.

## For students

**On your own.** If your instructor allows AI and wants it cited, there's
nothing to set up. Type `/receipt` after you use AI. Worked across several
days? Run it again and it adds the session to the same receipt, so one
assignment ends up as one record.

**With your instructor's policy.** If they hand you a `promptcite.policy.json`,
put it in your assignment folder. `/receipt` then follows it: the AI level and
the rule in your instructor's words, the citation style they want, and any
extra questions they turned on.

What `/receipt` can do for you:

- **Say what kind of help, at what stage, and how much.** Each session records
  the stage (planning, researching, drafting, revising, checking), how much of
  the work came from the AI, and how you checked it. You pick every answer.
- **Catch sources you haven't checked.** AI tools make up sources that look
  real. If you haven't confirmed one the AI named, `/receipt` names it before
  you hand anything in.
- **Cite your course's rule.** If the rule allows what you did, it can open
  your disclosure with it, quoted. It shows you the sentence first.
- **Other forms.** A one-line version for an LMS comment box, or a journal's
  AI declaration in Elsevier's wording.
- **No AI at all?** `/receipt none` writes a plain statement saying so.
- **Code.** A table of which files the AI wrote or improved, from the markers
  in your code and your answers.
- **Reflection.** If your instructor turns it on, four short questions about
  how the assignment went, stored in your words.

**Course files.** Different classes, different AI rules. Run
`/receipt course add syllabus.pdf` once per class and PromptCite saves that
class's rules, each one quoted word for word, on your machine. Bind a folder
with `promptcite course use csce-423`, or just say "working on CSCE 423." Ask
`/receipt ask "can I use AI to check my proof?"` and it answers from the
syllabus. Where the syllabus says nothing, it tells you to ask your
instructor. See [INSTALL.md](./INSTALL.md#course-files-one-per-class).

**If your work is questioned.** `promptcite timeline` puts your receipts and
git commits in date order, each entry hash-chained to the one before, as
evidence of your process. It's not proof, and it says so.

**Optional, while you work.** An AI-use ledger can record your AI edits
locally so `/receipt` reminds you what you did. It's off by default,
installed separately, stored outside your repo, and cleared once a receipt
uses it. For code, PromptCite can also mark AI-written blocks and ask what
you checked before you keep them. `promptcite-check` lists the ones you
haven't got to. Turn recording on per folder with `promptcite on`, off with
`promptcite off`. See [INSTALL.md](./INSTALL.md#optional-the-ai-use-hook).

## For instructors

You don't need to install anything to read a receipt. To check one hasn't been
edited:

```bash
npx -y github:camadkins/promptcite promptcite-verify receipt.json
```

To set an assignment's AI level, run this in the folder students will work in
and answer its questions:

```bash
npx -y github:camadkins/promptcite policy init
```

It takes an AIAS level (1 to 5) or a lane on the two-lane model, plus your
rule word for word, and writes `promptcite.policy.json`. Students' `/receipt`
then names the level, quotes your rule, and warns before output when a use
goes past it. It warns; it never blocks.

`promptcite help instructor` has a paragraph you can paste into a syllabus.
The full reading guide, every policy key, and what a receipt can and can't
tell you are in [docs/for-instructors.md](./docs/for-instructors.md).

## See it in action

A student finishes a policy essay in Claude Code and opens a fresh session.

```
> /receipt

Are you disclosing AI use from this current session, or previous?
> this session

A few quick details, answer all:
  1. course, instructor, assignment title
  2. your name or ID for this receipt
  3. citation style (MLA / APA / Chicago / IEEE / Harvard)
> ENGL 251, Dr. Martinez, Policy Analysis Essay, C. Hawkins, MLA

What did you use the AI for?
  brainstorm / outline / draft / edit / debug / explain / search
> brainstorm

  (1) one-sentence summary of what you asked the AI to brainstorm
  (2) did any AI-generated text appear verbatim?
  (3) stage: planning, right? how much of what you hand in came from it?
      how did you check it?
> counterarguments to carbon tax policies / no / yes, none, read it through

Anything to add for the revision statement?
> Used the list to structure my own outline, rewrote arguments in my own words.

═══ AI Use Receipt ═══

CITATION (MLA):
  "Counterarguments to carbon tax policies" prompt. *Claude*, model
  Claude Opus 4.7, Anthropic, 14 May 2026, claude.ai.

DISCLOSURE:
  I used Claude (Claude Opus 4.7) on May 14, 2026 to brainstorm
  counterarguments to carbon tax policies for this assignment. No
  AI-generated text appears in the final submission. I used the list to
  structure my own outline and rewrote the arguments in my own words.
  This receipt was generated inside Claude itself, so the tool, model,
  and date fields above were agent-verified rather than student-reported.

JSON receipt saved as ai-receipt.json.
```

Sample receipts for each kind of use are in [examples/](./examples/).

## Verifying a receipt

Each receipt carries a `content_hash`, the sha256 of its other fields in a
fixed order. `promptcite-verify` recomputes it and checks the receipt's shape.
Exit `0` means the hash matches and the receipt is valid. Point it at a folder
to check a stack at once.

Tamper-evident, not tamper-proof: the algorithm is public, so a determined
student can recompute the hash after editing. Full discussion in
[docs/for-instructors.md](./docs/for-instructors.md).

## Privacy

Everything runs on the student's machine. Once installed, PromptCite makes no
network calls, sends no telemetry, has no accounts or server, and has zero
runtime dependencies. Receipts stay in the assignment folder. Course files,
the ledger, and the help docs live under `~/.promptcite/`. Installing writes
each agent's rule file where that agent reads it. See [SECURITY.md](./SECURITY.md).

## License

PromptCite is open source under **AGPL v3**, for everyone: students,
instructors, schools, researchers, and anyone building on it. Use it, fork it,
change it. If you run a modified version as a service, share your changes.

- License: [LICENSE](./LICENSE) (AGPL v3 verbatim)
- Plain-language summary: [NOTICE.md](./NOTICE.md)

Ideas, issues, and PRs are all welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Docs

- [INSTALL.md](./INSTALL.md): per-agent install commands, flags, the hook, course files, the timeline
- [docs/for-instructors.md](./docs/for-instructors.md): reading receipts, policy files, `promptcite policy init`
- [docs/SCHEMA-CHANGELOG.md](./docs/SCHEMA-CHANGELOG.md): the receipt format, version by version
- [docs/adr/](./docs/adr/): why things are the way they are
- [examples/](./examples/): sample receipts
- [CONTRIBUTING.md](./CONTRIBUTING.md), [SECURITY.md](./SECURITY.md), [CHANGELOG.md](./CHANGELOG.md)
