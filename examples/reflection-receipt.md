# Example — Reflection on the whole assignment

A sample PromptCite receipt at schema 2.2. The full JSON is in
[`reflection-receipt.json`](./reflection-receipt.json).

**Scenario:** a HIST 210 paper. The instructor's `promptcite.policy.json`
sets `"reflection": true`. The student used Gemini to find where local 1918
flu coverage might be, then asked ChatGPT for ways to structure the paper.
When they wrote the receipt, `/receipt` asked the four reflection questions
once for the whole assignment.

---

## Reflection (in the JSON, not the paper)

| Question | Answer, word for word |
|---|---|
| What did you try before using AI? | I searched the library catalog and only found national histories, nothing about Lincoln. |
| Why did you turn to AI at that point? | I was stuck on where local coverage would even be. |
| What did you change about what it gave you, and why? | Two of the papers it named did not exist, so I only kept the ones I found in the archive. I ignored its outline and went in time order. |
| Would you use AI the same way next time? | Yes for finding where to look. No for the outline, my own was better. |

## Disclosure paragraph

> I used Gemini (Gemini 2.5 Pro) on October 30, 2026 to search for newspapers
> that covered the 1918 flu in Lincoln, and I independently verified those
> sources against the Nebraska Newspapers archive. The sources are cited in
> this submission's bibliography directly, not through the AI. On November 7 I
> used ChatGPT (GPT-4o) to outline the paper, and my submission did not follow
> the AI's outline. None of the AI-generated text appears in the final
> submission. I used my own order in the end, closer to a timeline. The
> November 7 session was recorded inside ChatGPT; the October 30 details are
> from my own notes.

---

## What this example demonstrates

- **One reflection, two sessions.** It's about the assignment, so it sits at
  the top of the receipt, not on either session.
- **The student's words, as typed.** Nothing was reworded or tidied. The
  answers are short, and short is fine.
- **It stays out of the paragraph.** The disclosure reads the same as it
  would without a reflection. The instructor who asked for it reads it in the
  JSON, or in `promptcite-verify`'s report.
- **Turned on by the policy.** Without `"reflection": true` somewhere, the
  questions aren't asked. A student can also skip any of them.

See [ADR 0016](../docs/adr/0016-reflection-questions.md).
