# Example — No-AI declaration

What `/receipt none` writes. There's no JSON for this one: a receipt records
AI sessions, and this has none.

**Scenario:** an ENGL 150 essay where the syllabus asks students to say
whether they used AI. The student didn't, apart from Google Docs' spell
checker. Their ledger is off and there's no receipt for this assignment in
the folder, so nothing contradicts the statement.

---

```
═══ No-AI Declaration ═══

ENGL 150, Dr. Example, Essay 3: Place and memory, M. Torres, November 8, 2026

I did not use generative AI tools for any part of this assignment. The only
writing tools I used were the spell checker in Google Docs, for spelling and
grammar checks that did not write or rewrite any of my text.
```

*This is your statement, not proof of anything. Your drafts and version
history are the evidence of your process, so keep them.*

---

## What this example demonstrates

- **A statement, not a receipt.** Nothing is hashed and there's nothing for
  `promptcite-verify` to check. It says what the student says, nothing more.
- **It checks before it writes.** If the ledger or a receipt showed AI use on
  this assignment, `/receipt none` would say so and offer a receipt instead.
- **Basic checkers are named, not hidden.** A tool that only flags spelling
  goes in the second sentence. One that rewrote sentences is AI use, and the
  student gets the interview instead.

See [ADR 0014](../docs/adr/0014-other-forms-and-the-no-ai-declaration.md).
