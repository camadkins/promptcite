# Using /receipt

PromptCite helps you write down how you used AI on an assignment, in a form
your instructor can check. It runs on your machine. Nothing is sent anywhere,
and it never reports on you. It only writes what you confirm.

## The usual workflow

1. Start the assignment in its own folder. Optional: `promptcite on` to keep
   a local note of AI edits there, and `promptcite course use <id>` if you
   have a course file for the class.
2. Work as normal with your agent.
3. When you're done (or after each session), type `/receipt`. It asks a few
   short questions and writes a receipt JSON plus a disclosure paragraph and
   citations you can paste into the assignment.
4. Worked across several days? Run `/receipt` again and pick the same file.
   One receipt holds every session of one assignment, oldest first.
5. Hand in the receipt with the work. Run `promptcite off` when it's in.

## Modes

Type these after `/receipt`:

| Mode | What it does |
|---|---|
| (nothing) | Full interview, then the receipt |
| `quick` | Uses your saved settings and asks only what it must |
| `settings` | Save your name, default citation style, language |
| `verify <file>` | Check a receipt hasn't been edited and is well-formed |
| `recall` | Show your local AI-use notes for this folder (read-only) |
| `attest` | Go through `@ai-unverified` markers and close them out |
| `course add <syllabus>` | Read a local syllabus and draft a course file. Nothing is saved until you say yes |
| `course` | Show which course this folder follows |
| `ask <question>` | Answer from your course's AI rules, quoting the syllabus |
| `help` | A short version of this page |

## Course rules

A course file (`~/.promptcite/courses/<id>.json`) holds what one class's
syllabus says about AI, each rule with the syllabus quote. If the syllabus
doesn't say, PromptCite says "not stated, ask your instructor". It never
treats silence as permission. If the assignment folder has a
`promptcite.policy.json` from the instructor, that wins over the course file.

Commands: `promptcite course`, `course show <id>`, `course use <id>`,
`course clear`, `course check <file>`.

## Verifying a receipt (for instructors too)

`promptcite-verify receipt.json` checks it. Add `--submission <file>` to check
the submitted file matches. Give it several files or a folder for a batch.

Exit codes: 0 good, 1 edited after it was made, 2 no hash, 3 can't read it,
4 well-hashed but malformed, 5 the submission file doesn't match.
