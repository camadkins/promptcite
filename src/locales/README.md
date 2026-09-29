<!-- SPDX-License-Identifier: AGPL-3.0-only -->
<!-- Copyright (c) 2026 Cam Adkins -->

# Disclosure strings

Every sentence in a PromptCite disclosure paragraph comes from a file in this
folder. `en.md` is English and is the reference. Each other language is one
more file with the same keys, translated.

The agent never translates on the fly. An instructor who asks for Spanish
disclosures gets wording a Spanish speaker reviewed, which matters for a
document a student signs their name to.

## Add a language

No code, no build tools beyond Node.

1. Copy `en.md` to `<code>.md`, using the language's two-letter code: `es.md`,
   `fr.md`, `de.md`. Add a region only when it changes the wording, e.g.
   `pt-BR.md`.
2. In the frontmatter at the top, set `code` to match the file name, `name` to
   the language's own name (`Español`, not `Spanish`), and `status` to
   `needs-review`.
3. Translate the text under each `## key` heading. That's the whole job.
4. Run the check and fix anything it reports:

   ```
   node bin/rule.js --check
   ```

5. Regenerate the Gemini context file so it includes your language, then
   open a pull request with both files:

   ```
   node bin/rule.js --write-gemini
   ```

A second speaker reviews the translation. Once they approve, `status` becomes
`reviewed`.

## What to keep exactly as it is

- **The `## key` headings.** `## brainstorm.lead` stays `## brainstorm.lead` in
  every language. The agent looks sentences up by these names.
- **Every `{placeholder}`, braces included.** `{tool}`, `{model}`, `{date}` and
  the rest get filled in by the agent. Move them wherever your grammar needs
  them, but don't translate or drop them.
- **One sentence per key.** Even if your language would naturally merge two
  sentences, keep them separate here. The agent joins them.

Lines starting with `>` are notes for you, explaining what a placeholder
holds. Translate them too if it helps the next translator, or delete them.
They never reach the student.

## What the check catches

`node bin/rule.js --check` fails with a plain-English message if a file:

- is missing a key that `en.md` has, or has one it doesn't
- changed, dropped, or added a `{placeholder}`
- left a key empty
- has a `code` that doesn't match its file name

The same check runs in CI on every pull request.

## What it can't catch

Whether the translation is accurate and reads naturally. That's what the
review is for. Aim for plain and neutral: this is a statement a student makes
to their instructor, so no slang, and no wording that sounds like an apology
or a boast.
