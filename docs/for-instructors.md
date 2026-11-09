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
   (MLA / APA / Chicago / IEEE / Harvard)
3. **A JSON receipt** as an attachment or pasted appendix

Sometimes also a one-line **short statement** (for an LMS comment box) or a
**journal declaration**, stored as `outputs.short_statement` and
`outputs.journal_statement`. They restate the paragraph and never replace it.

A student who used no AI may hand you a **no-AI declaration** from
`/receipt none` instead. It's their statement and nothing more: no JSON, no
hash, nothing to verify. PromptCite won't write one when the student's ledger
or a receipt for the assignment shows AI use, unless the student says those
entries are from other work.

A student asked about their process may hand you a **process timeline**
(`promptcite-timeline.md` and `.json`): their receipt sessions and git commits
in date order. Each entry is hash-chained to the one before, so
`promptcite timeline verify <file>` catches an edit after it was made. Read it
as evidence of process, not proof. Git history can be changed before export,
and the chain doesn't show when the file was made. If the student handed you
the head hash earlier, a matching later copy is the same file. Ledger notes
appear only when the student chose to add them, and they're incomplete by
design. See [ADR 0015](./adr/0015-process-timeline.md).

You don't need any software to read these. The disclosure and citation
are plain text. The JSON is structured and human-readable.

## How to read the JSON receipt

The receipt fields follow [`src/schema.yaml`](../src/schema.yaml).
Required structure:

```json
{
  "schema_version": "2.2",
  "generated_at": "2026-05-27T14:30:00Z",
  "content_hash": "<sha256 of the receipt fields, or null>",
  "submission_hash": "<sha256 of the submitted file, or null>",
  "student": "<name or ID>",
  "assignment": { "course": "...", "instructor": "...", "title": "..." },
  "ai_use": [
    {
      "tool": "...", "model": "...", "date": "YYYY-MM-DD",
      "metadata_source": "agent_reported" | "student_claimed",
      "category": "brainstorm|outline|draft|edit|debug|explain|search",
      "prompt_summary": "<student-written summary>",
      "direct_content_used": true | false,
      "revision_statement": "<student-written>",
      "source_verification": true | false | null,
      "stage": "planning|researching|drafting|revising|checking",
      "extent": { "ai_share": "none|small|part|most",
                  "student_change": "kept|edited|reworked" },
      "citations": { "mla": "...", "apa": "...", "chicago": "...",
                     "ieee": "...", "harvard": "..." },
      "verification": { "attested": true, "statement": "...",
                        "methods": ["read_through", "ran_tests"] }
    }
  ],
  "outputs": { "disclosure_statement": "..." }
}
```

**Stage, extent, and how it was checked (2.2, optional).** `stage` says when
in the work a session happened, `extent` says how much of the submission came
from the AI and what the student did with it, and `verification.methods` says
how they checked it. The student picks each one from a short list, and
nothing measures them, so read them the way you'd read the rest of the
receipt: as what the student says. They're absent on older receipts and
whenever a student skipped the question. Absent is not "none". See
[ADR 0012](./adr/0012-stage-and-extent.md).

**`ai_use` is a list.** One receipt covers one *assignment*, and an assignment is
routinely worked across several days — an outline on Monday, a debug session on
Thursday. Each entry is one session, ordered oldest first, carrying its own
tool/model/date, its own provenance, and its own citations. A student who used AI
once has a list of one.

**You may still receive schema 1.x receipts**, where `ai_use` is a single object,
`metadata_source` sits at the top level, and the citations live under
`outputs.citation_mla` and friends. Those are valid, not malformed — the format
changed in 2.0 and the verifier reads both. See
[`docs/SCHEMA-CHANGELOG.md`](./SCHEMA-CHANGELOG.md) for the field-by-field
mapping and the version history.

## Reading a receipt with several sessions

Take the sessions in order and read them as a narrative of how the work was done.
`promptcite-verify` prints each one with what the student wrote about it:

```
Session 1:  ChatGPT (GPT-4o) on 2026-05-14, used to outline
            Asked for a structure for an essay arguing against a carbon tax
            provenance: agent-reported (the AI filled tool/model/date)
            AI text kept verbatim: no
            revision: Followed the shape loosely and rewrote every heading myself.
            sources checked by the student: not stated
            appendix: none attached
Session 2:  Claude (Claude Sonnet 4.6) on 2026-05-16, used to debug
            Asked why my citation-parsing script dropped the last entry
            provenance: student-claimed (the student typed tool/model/date)
            AI text kept verbatim: no
            revision: It explained the off-by-one; I fixed the loop myself.
            sources checked by the student: not stated
            appendix: attached (diff_or_test_log)
```

**The number of sessions is not a measure of anything.** This is the one thing
worth being deliberate about. A receipt listing four short sessions is not worse
than one listing a single long one, and it is certainly not worse than a
submission with no receipt at all. The count reflects how the student's week was
shaped and how thoroughly they disclosed — not how much of the work was theirs.
If a long list reads as suspicious, the tool has made you a worse reader, and
PromptCite deliberately never totals or scores the sessions for exactly that
reason.

What *is* worth reading closely, per session: the `category`, whether
`direct_content_used` is true, and the `revision_statement`. Those describe the
work. A four-session receipt where every session is `explain` with
`direct_content_used: false` describes a student who used AI to understand
material and then wrote their own — which is usually what you were hoping for.

Sessions may have **different provenance**, and that is expected rather than
inconsistent: a session disclosed inside the tool is `agent_reported`, one added
later from the student's notes is `student_claimed`. See below.

## The `metadata_source` field — what it tells you

Per session in schema 2.0 — each entry in `ai_use` carries its own.
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

The **content fields** (`prompt_summary`, `direct_content_used`,
`revision_statement`, `source_verification`) are always student-
authored. PromptCite captures what the student writes; it does not
interpret or verify it.

## Verifying the receipt hasn't been edited

Receipts include a `content_hash` field: SHA-256 of the canonical
serialization of all other fields. You can detect casual editing
by running:

```bash
npx -y github:camadkins/promptcite promptcite-verify path/to/receipt.json
```

The verifier also validates the receipt against the schema and prints a
plain-English summary: student, assignment, then for each session the
tool/model/date, category, provenance, and what the student wrote about it
(whether AI text was kept verbatim, the revision statement, whether they
checked sources, and which appendix kinds are attached), followed by the
disclosure paragraph, the hash status, and which schema generation it found.
It accepts both 1.x and 2.x receipts. Anything the student left unset prints as
"not stated"; that is not a flag. The tool reports what was disclosed. It does
not count, score, or rank it.

The schema check covers the shape of every field, including that dates are real
ISO 8601 dates and that an attestation, when present, has the right form. A
`Note:` line appears if the sessions are not listed oldest first. That is
advisory only: students may disclose out of order, and it never changes the
verdict or the exit code.

### A stack of receipts

Give it several files, or a directory (its `*.json` files, not subfolders), and it
prints one status line per receipt instead of a full report:

```bash
promptcite-verify submissions/essay-1/
```

```
INTACT       submissions/essay-1/alvarez.json
MISMATCH     submissions/essay-1/chen.json
INVALID      submissions/essay-1/okafor.json
UNVERIFIABLE submissions/essay-1/reyes.json
```

`INVALID` means the hash is intact but the receipt fails the schema. Add
`--details` to follow each status line with the full report. Nothing is totalled
across receipts, and there is no export; the only summary is the exit code.

Exit codes (a batch exits with the most severe one present, in this order of
severity: 3, 1, 5, 4, 2, 0):
- `0` hash matches AND the receipt is well-formed (unmodified, valid)
- `1` hash mismatch (receipt was edited)
- `2` no `content_hash` field, or null (the agent had no code-execution
  tool when emitting, OR an older receipt format)
- `3` user error (file missing, bad JSON, etc.)
- `4` hash matches but the receipt fails schema validation (the summary
  lists the specific problems)
- `5` the file given with `--submission` does not match the receipt's
  `submission_hash`

### `submission_hash`: binding the receipt to the work

A receipt (schema 1.1 or later) may also carry a `submission_hash`: the SHA-256 of
the **actual file the student submitted** (their essay, their source
file), as opposed to `content_hash` which only covers the receipt's own
fields. When present, you can confirm a receipt belongs to a specific
document by handing the verifier the submitted file:

```bash
promptcite-verify receipt.json --submission path/to/their-essay.pdf
```

It reports `MATCH`, `DIFFERENT` (exit `5`), or that the receipt has no
`submission_hash` (exit unchanged). `DIFFERENT` means the file is not byte for
byte the one the receipt was bound to; it cannot say why. If you prefer, hash it
yourself and compare:

```bash
shasum -a 256 path/to/their-essay.pdf
```

Same honest limits apply (a student could hash a different file): it's a binding
aid, not proof. `null` means the agent couldn't hash the file at generation time.
`--submission` checks one file against one receipt, so it does not combine with a
batch.

**Honest limits:** this is tamper-evident, not tamper-proof. A
determined student can recompute the hash after editing since the
algorithm is public and the verify tool is open source. The check
matters because casual editing won't bother recomputing. Real
cryptographic non-repudiation needs server-side signing or
transparency-log inclusion, which is on the roadmap for institutional
integrations.

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
> receipt (see github.com/camadkins/promptcite). Receipts should accompany the
> submission as a JSON attachment. Failure to disclose AI use is
> treated as a violation of the course's academic integrity policy."

**Tiered policy by category:**
> "Brainstorming, explaining, and searching with AI are permitted for
> all assignments and require a core receipt. Outlining and editing
> require a core receipt plus a revision statement. Drafting and
> debugging require a core receipt plus a share-link or diff appendix."

### Machine-readable policy (`promptcite.policy.json`)

You can turn a policy like the one above into a file that `/receipt`
*follows automatically*. Drop a `promptcite.policy.json` in the
assignment folder (e.g. the starter repo students clone). When present,
`/receipt` steers the interview to it — offering only your allowed
categories, using your required citation style, and requiring the
source-verification answer or appendix you specify. A starter file lives
at [`docs/promptcite.policy.example.json`](./promptcite.policy.example.json):

```json
{
  "allowed_categories": ["brainstorm", "outline", "search"],
  "required_citation_style": "APA",
  "require_source_verification": ["search", "draft"],
  "required_appendix": { "draft": "share_link_or_excerpt", "debug": "diff_or_test_log" }
}
```

More examples, one per kind of course:

- [Writing course](./promptcite.policy.writing-course.example.json) —
  ENGL 251, a policy analysis essay. Brainstorm, outline, search and
  edit are allowed, MLA style, and search use must be source verified.
  No drafting or debugging.
- [CS course](./promptcite.policy.cs-course.example.json) —
  CSCE 423, programming assignments. Explain, brainstorm, search and
  debug are allowed, IEEE style, debug use needs a diff or test log
  appendix, and students attest to what they checked.
- [Lab course](./promptcite.policy.lab-course.example.json) —
  BIOL 210, lab reports. Explain, brainstorm, outline and search are
  allowed, APA style, and search use must be source verified.

All keys are optional. The policy is **configuration, not a receipt** — it
is never hashed, never embedded in a student's receipt, and makes no
network calls. It guides honest disclosure; it does **not** detect or
prevent dishonesty (a student can ignore or edit the file). Same trust
model as everything else here. Where a student's saved settings conflict
with your policy, the policy wins.

**Reflection questions.** Set `"reflection": true` and `/receipt` asks the
student four questions about the assignment: what they tried before AI, why
they turned to it, what they changed, and whether they'd use it the same way
again. The answers land in the receipt's `reflection` object exactly as the
student typed them. They can skip any question, and a short answer is a real
one, so read it as their account rather than a score. See
[ADR 0016](./adr/0016-reflection-questions.md).

**AI levels.** If you grade on the AI Assessment Scale (AIAS), or your own
scale, set the level for the assignment and paste your rule with it:

```json
{ "ai_level": { "level": 2, "quote": "You may use AI to brainstorm and outline. Everything you submit must be your own.", "where": "Assignment 3" } }
```

Before the receipt is written, a student whose logged uses go past that level
sees a warning with your rule quoted word for word. The receipt still gets
written, unchanged, and the level and warning never go into it. You decide
what the disclosure means. For AIAS, level 1 allows no use, level 2 allows
brainstorm, outline, search, and explain, and levels 3 to 5 allow all seven
categories, so the warning can't tell 3, 4, and 5 apart. A custom scale lists
which categories each of its levels allows. A syllabus that sets levels per
kind of assignment can be put in the student's course file the same way. See
[ADR 0011](./adr/0011-ai-levels-warn-never-gate.md).

**Disclosure language.** Set `"disclosure_language": "es"` (or any language
PromptCite ships) and every student's disclosure paragraph comes out in that
language, built from reviewed wording rather than a fresh machine
translation. The receipt JSON and citations stay in English. The languages
available are the files in [`src/locales/`](../src/locales/); an unavailable
language falls back to English and the student is told.

**Your syllabus already counts.** Students can hand PromptCite your syllabus
with `/receipt course add`, and it saves your AI-use rules to a course file on
their machine, each rule quoted word for word from your syllabus. From then on
their agent advises them by your rules in your class, and a
`promptcite.policy.json` you publish for one assignment still takes precedence.
Two things follow for you. Write the AI section of your syllabus plainly,
since what you leave unsaid comes back to students as "the syllabus doesn't
say; ask your instructor" rather than as permission. And the course file is the
student's reading, never sent to you and never part of a receipt; your
syllabus stays the authority. See [ADR 0009](./adr/0009-course-policies-from-the-syllabus.md).
The one exception is the student's choice: when a rule plainly allows what
they did, they can have the disclosure open with it, quoted, like "Per the
CSCE 423 AI policy ("..."), I used ...". They see the sentence and say yes
first, and it's never offered for a use past the rule. See
[ADR 0013](./adr/0013-students-may-cite-the-course-rule.md).

**Policy that PromptCite explicitly does not support:**
> ❌ "Submit a PromptCite receipt to verify your AI use." — PromptCite
> does not verify anything. It is a disclosure artifact, not a
> verification mechanism. A student who lies on the receipt produces
> an inaccurate receipt; PromptCite cannot catch that. The same
> limitation applies to citations.

## Recommending it to students without recommending surveillance

The question worth asking before you point a class at any tool is what it can
be made to do *to* the students who use it. PromptCite's answer is deliberate:

**It cannot testify against the student who installed it.** That is a design
constraint, not a promise — it is why the optional ledger (below) is written
outside the student's repository, purged once used, and excluded from every
artifact the tool produces.

**It never authors a number.** No percentages, counts, or scores come from
automation. Everything quantitative in a receipt is a sentence the student
chose to write. This matters for you as much as for them: a receipt that reads
like a *report* silently puts you in an enforcement posture — if the tool tells
you a student used AI heavily, you now have to decide whether to act on that.
A receipt that reads like a *disclosure* leaves the pedagogical decision where
it belongs.

**Its absence proves nothing.** No unmarked file, missing marker, or empty
ledger is evidence a student didn't use AI. If you treat any of them that way,
you are using the tool outside its stated design and it will mislead you.

One thing worth deciding before you recommend it: **whether disclosed AI use
can itself be penalized.** If students believe disclosure raises their risk,
the rational move is to stop disclosing, and you'll get less signal than you had
before. Saying plainly that honest disclosure is never itself the problem costs
nothing and is what makes the rest of this work.

### Optional: attestation, for the "verify it and it's yours" position

If your position is that an LLM's output becomes the student's work at the
moment they verify it, attestation is the part of PromptCite built for you. It
records the verification rather than the provenance.

Turn it on with one key:

```json
{ "require_attestation": true }
```

What the student then experiences: AI-written blocks above a size threshold get
a comment reading `@ai-unverified`. Running `/receipt attest` walks them
through each one and asks what they did to check it. Their answer is written
into the comment, in their words:

```
// @ai-verified 2026-08-24 Claude Opus 5 via PromptCite (pc:a4f21): traced the
// base cases by hand, tested n=0 and both-empty, fixed an off-by-one in the
// loop bound.
```

Before submitting they can run `promptcite-check`, which lists anything still
pending and exits non-zero while any remain. It is a to-do list they run on
themselves.

**Students can switch it off, and that is deliberate.** `promptcite off` stops
recording on their machine, and it overrides your policy file. A tool that
could be pointed at a class and made to record against a student's wishes is a
surveillance tool, which is the one thing this cannot become. Your policy sets
the expectation and the receipt is what you read; the enforcement you have is
the one you already had.

**Two things to be clear-eyed about before you require it.**

*It cannot tell you whether they actually checked.* Nothing compares the
attestation to the code. A student who writes "looks fine" has written a weak
attestation, not a false one. The trust model is a citation's, the same as
everything else here.

*A clean `promptcite-check` is not a clean submission.* Markers land only on
larger insertions, made by an edit rather than a whole-file write, in file types
whose comment syntax PromptCite knows. AI-assisted work that never became one of
those leaves nothing to find, so a clean run means "no pending markers" and
never "no unverified AI here." If you plan to treat a passing check as evidence
of anything, don't require the feature — you'll be reading it as a detector, and
it will mislead you.

What it does buy, and the reason it's worth requiring: a student clearing
markers is rereading code the model wrote. That is the behavior the position is
actually about, and no amount of receipt-filing after the fact produces it.

The attestation can also travel in the receipt, as an optional per-session
`verification` object (schema 2.1). Absent on most receipts, including every one
written before this existed. Absence means the student made no claim, not that
they skipped the reading.

### Optional: the AI-use ledger

Students can install a hook that records their AI insertions locally, so
`/receipt` can remind them what they did rather than asking them to remember
three days later. It's off by default and separately installed. If you want it
for an assignment, add to your policy file:

```json
{ "require_ledger": true }
```

- Records only timestamp, tool, model, file, and lines added. **Never code,
  never prompts.**
- Lives in `~/.promptcite/`, outside any repository, and `/receipt` deletes what
  it used. Nothing accumulates, and nothing lands where it could be collected
  with a submission.
- It is **not evidence and not complete** — a student who asks the AI to explain
  something and then writes the code themselves generates no entries at all.
  Requiring it improves the *accuracy* of honest disclosure. It does not, and
  cannot, detect anything.

### For your department's software review

PromptCite is usually easier to approve than it looks:

| Question | Answer |
|---|---|
| Does it send data anywhere? | No. Zero network calls, at install and at runtime. |
| Telemetry, analytics, install IDs? | None. CI blocks them from the codebase. |
| Accounts, logins, hosted service? | None. There is no server. |
| Third-party dependencies? | Zero runtime dependencies — Node built-ins only, CI-enforced. |
| Where does student data live? | On the student's machine, and nowhere else. |
| Is the source auditable? | Yes — AGPL-3.0-only, ~1,100 lines, on GitHub. |
| What does it install? | One rule file per agent. The hook and the attestation gate are separate and opt-in. |
| Does the check tool report anywhere? | No. `promptcite-check` reads files, prints to the terminal, and exits. It writes nothing and sends nothing. |
| Can it be removed cleanly? | Yes — `--uninstall` per agent; the hook removes only its own entry. |

Schools can deploy it under the same AGPL v3 license as everyone else. There is no separate institutional license.

## Limitations to be aware of

- **Local-editability:** as noted above, the JSON is editable after
  generation. PromptCite v1 has no signing or transparency log.
- **Self-disclosure, not detection:** PromptCite never tries to
  determine whether a student used AI. It records what the student
  declares.
- **English-only output:** receipt language is English. Non-English
  disclosure templates may come later.
- **Aggregation stops at the assignment:** one receipt covers one assignment,
  however many sessions went into it. There is no combined view across several
  assignments or a whole term, by design.
- **More sessions is not more proof.** A receipt with four sessions is exactly as
  verifiable as one with a single session — which is to say, it is a disclosure,
  not evidence. See the local-editability note above.
- **Attestation coverage is partial by construction:** markers only appear on
  larger edit-insertions in known file types, so `promptcite-check` clears the
  markers that exist rather than the AI use that happened. Treating a passing
  check as proof reads the tool as a detector, which it is not.
- **Attestations are unverified:** the student's account of what they checked is
  student-authored like every other content field. Nothing compares it to the
  code.
- **The ledger is incomplete by construction:** it only sees insertions an
  agent makes into a file. AI use that never becomes an insertion — an
  explanation the student types up themselves, a conversation in a browser —
  leaves no trace. Treat it as an aid to the student's memory, never as a
  record of what happened.

## Reporting issues with the schema

If you're a department or institution adopting PromptCite at scale
and the receipt schema doesn't fit your governance review, file an
issue at https://github.com/camadkins/promptcite/issues. Schema
changes follow semver; v1.x receipts will remain readable.
