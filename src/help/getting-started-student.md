# Getting started: students

PromptCite adds `/receipt` to your AI agent. After you use AI on an
assignment, `/receipt` asks a few short questions and gives you a citation, a
disclosure paragraph, and a JSON receipt to hand in. It runs on your machine
and writes only what you confirm.

## 1. Install once

```
npx -y github:camadkins/promptcite
```

That adds `/receipt` to the agents it finds on your machine, and tells you if
one needs an extra step. Open a new session in your agent afterward.

## 2. Two ways to use it

**On your own.** Your instructor allows AI and wants it cited, or you just
want a record. Nothing to set up: go to step 3. If the syllabus has AI rules,
type `/receipt course add syllabus.pdf` in your agent once and PromptCite
keeps them as a course file. Then tell a folder which course it's for:

```
promptcite course use csce-423
```

**Your instructor gave you a `promptcite.policy.json`.** Put it in the
assignment folder. `/receipt` follows it: the AI level and your instructor's
rule, the citation style they want, and any extra questions they turned on.

Either way, PromptCite never blocks you. If you used AI in a way your course
doesn't allow, it tells you, quotes the rule, and still writes an honest
receipt. What it means is your instructor's call.

**Optional, while you work:** `promptcite on` keeps a local note of AI edits
so `/receipt` can remind you what you did. It needs the recording hook,
installed once with `npx -y github:camadkins/promptcite --only claude-hook`
(Claude Code) or `--only codex-hook` (Codex CLI).

## 3. Write the receipt

Type `/receipt` in your agent when you're done, or after each session. Run it
again on another day and it adds that session to the same receipt.

```
/receipt          the full interview
/receipt quick    uses your saved settings and asks only what it must
/receipt none     you didn't use AI: writes a no-AI declaration instead
```

## 4. Before you hand it in

```
promptcite-check                  code: lists AI blocks you haven't verified yet
promptcite-verify ai-receipt.json checks the receipt hasn't been edited
```

Clear open blocks with `/receipt attest`. Then paste the citation and the
disclosure into your work and attach the JSON. Run `promptcite off` once it's in.

## If your work is questioned

```
promptcite timeline   your receipts and git commits in date order, hash-chained
```

It's evidence of your process, not proof. Hand in the head hash it prints if
you want a later copy to be checkable.

## More help

Ask your agent "how do I use /receipt?" and it reads the help files installed
with PromptCite. `promptcite help instructor` shows the instructor side.
