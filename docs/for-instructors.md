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

You don't need any software to read these. The disclosure and citation
are plain text. The JSON is structured and human-readable.

## How to read the JSON receipt

The receipt fields follow [`src/schema.yaml`](../src/schema.yaml).
Required structure:

```json
{
  "schema_version": "1.1",
  "generated_at": "2026-05-27T14:30:00Z",
  "metadata_source": "agent_reported" | "student_claimed",
  "content_hash": "<sha256 of the receipt fields, or null>",
  "submission_hash": "<sha256 of the submitted file, or null>",
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
                "citation_chicago": "...", "citation_ieee": "...",
                "citation_harvard": "...", "disclosure_statement": "..." }
}
```

`citation_ieee`, `citation_harvard`, and `submission_hash` arrived in
schema 1.1 and are optional — receipts from older clients (schema 1.0)
simply omit them. See [`docs/SCHEMA-CHANGELOG.md`](./SCHEMA-CHANGELOG.md)
for the version history.

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
plain-English summary (student, assignment, AI tool/model/date, hash
status, schema status) so you don't have to read the raw JSON.

Exit codes:
- `0` hash matches AND the receipt is well-formed (unmodified, valid)
- `1` hash mismatch (receipt was edited)
- `2` no `content_hash` field, or null (the agent had no code-execution
  tool when emitting, OR an older receipt format)
- `3` user error (file missing, bad JSON, etc.)
- `4` hash matches but the receipt fails schema validation (the summary
  lists the specific problems)

### `submission_hash` — binding the receipt to the work

A schema-1.1 receipt may also carry a `submission_hash`: the SHA-256 of
the **actual file the student submitted** (their essay, their source
file), as opposed to `content_hash` which only covers the receipt's own
fields. When present, you can confirm a receipt belongs to a specific
document by re-hashing the submitted file:

```bash
shasum -a 256 path/to/their-essay.pdf
```

and comparing it to the receipt's `submission_hash`. Same honest limits
apply (a student could hash a different file) — it's a binding aid, not
proof. `null` means the agent couldn't hash the file at generation time.

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
> receipt (see promptcite.io/install). Receipts should accompany the
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

All keys are optional. The policy is **configuration, not a receipt** — it
is never hashed, never embedded in a student's receipt, and makes no
network calls. It guides honest disclosure; it does **not** detect or
prevent dishonesty (a student can ignore or edit the file). Same trust
model as everything else here. Where a student's saved settings conflict
with your policy, the policy wins.

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
| What does it install? | One rule file per agent. The hook is separate and opt-in. |
| Can it be removed cleanly? | Yes — `--uninstall` per agent; the hook removes only its own entry. |

For institutional deployment, see [`LICENSE-COMMERCIAL`](../LICENSE-COMMERCIAL).

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

For commercial license inquiries (universities deploying PromptCite
institutionally), see [`LICENSE-COMMERCIAL`](../LICENSE-COMMERCIAL).
