# Troubleshooting

Start with `promptcite --doctor`. It shows which agents were found and whether
each installed rule matches this version. It writes nothing.

## `/receipt` doesn't show up

- Open a fresh session. Most agents only read rules when a session starts.
- Run `promptcite --list` to see if your agent was detected. If not, install
  it by name: `promptcite --only <id>`.
- Some agents only read rules per project. Run, inside the project:
  `promptcite --only <id> --with-init`.
- Agent not listed at all? `promptcite --print-rule > receipt-rule.md` and
  add that file wherever your agent reads instructions.

## It doesn't know my course

- `promptcite course` lists your course files. `promptcite course check <file>`
  says why one isn't usable.
- Mention the course the way the file names it (id, name, or an alias), or
  bind the folder: `promptcite course use <id>`.

## It didn't warn about my AI level

- `promptcite policy check` shows which level applies here and where it came
  from. Add `--assignment <name>` for one assignment in your course file.
- On AIAS, levels 3, 4, and 5 all allow every use category, so the check
  can't tell them apart. Read your instructor's quote for what each one means.

## The receipt missed earlier work

- With `promptcite on` and the hook installed (`promptcite --only claude-hook`
  or `--only codex-hook`), PromptCite keeps a local note of AI edits and of
  where your agent keeps the session, so a late `/receipt` can still see
  earlier sessions. Without it, `/receipt` only knows what's in the current chat, so
  tell it what you did before.
- `/receipt recall` shows what's recorded for this folder.

## verify says INVALID or MODIFIED

- MODIFIED (exit 1): the receipt was edited after `/receipt` wrote it. Make a
  fresh one rather than editing by hand.
- INVALID (exit 4): the file is missing a field or has a bad value. The report
  lists each problem. Older receipts only get notes for date formats.

## Uninstall

`promptcite --uninstall` removes what it installed. `--only <id> --uninstall`
removes one agent but keeps a shared `AGENTS.md` block other agents still
read; add `--force` to remove it anyway. Empty folders left behind are listed
with an `rmdir` line. They're yours to keep or delete.

## Still stuck

Open an issue at https://github.com/camadkins/promptcite/issues with the
`promptcite --doctor` output. Leave out anything private.
