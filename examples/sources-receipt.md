# Example — A source the student hasn't confirmed

A sample PromptCite receipt at schema 2.2. The full JSON is in
[`sources-receipt.json`](./sources-receipt.json).

**Scenario:** an AGRO 153 lab report. The student asked ChatGPT for studies on
cereal rye and soil nitrogen and it named three. They found two in the library
and on the Extension site. The third they couldn't find. Before writing the
receipt, `/receipt` flagged it:

> Before you submit: you haven't confirmed **"Hansen and Kirk (2017), Soil
> Science Society of America Journal"**. AI tools make up sources that look
> real. Find each one in the library or the original before you cite it, or
> take it out of your paper.

---

## Sources (in the JSON and the verify report)

| Source, as the student named it | Confirmed? | How |
|---|---|---|
| Ruis et al. (2019), Agronomy Journal | yes | found it through the UNL library database |
| the Nebraska Extension cover crop guide (2020) | yes | downloaded it from the Extension site |
| Hansen and Kirk (2017), Soil Science Society of America Journal | **no** | |

## Disclosure paragraph

> I used ChatGPT (GPT-4o) on November 7, 2026 to search for studies on cereal
> rye and soil nitrogen in the Great Plains. I independently verified the Ruis
> et al. (2019) study and the Nebraska Extension cover crop guide against the
> UNL library database and the Extension site, but not Hansen and Kirk (2017);
> consult that one directly before relying on it. The sources are cited in this
> submission's bibliography directly, not through the AI. I read the two
> studies I could find and cited them myself. This receipt was generated
> inside ChatGPT itself, so the tool, model, and date fields above were
> agent-verified rather than student-reported.

---

## What this example demonstrates

- **Flagged before output, by name.** The student saw which source was open
  and could still go check it. The receipt got written either way.
- **`source_verification` is the summary.** One source isn't confirmed, so
  it's `false`. The verifier rejects a receipt where the list and the boolean
  disagree.
- **Named in the verify report too.** `promptcite-verify` prints an advisory
  note naming the unconfirmed source. It's a note, not a failure.
- **PromptCite looked nothing up.** "Confirmed" is the student's word.

See [ADR 0018](../docs/adr/0018-unconfirmed-sources.md).
