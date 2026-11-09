# Getting started: instructors

Your students install PromptCite. You don't need it to read a receipt: the
citation and disclosure are plain text, and the JSON is readable as is.
PromptCite is a disclosure tool, not a detector. It records what a student
says and can't catch a student who leaves something out.

## 1. Check a receipt

```
npx -y github:camadkins/promptcite promptcite-verify ai-receipt.json
npx -y github:camadkins/promptcite promptcite-verify receipts/
```

INTACT means the receipt hasn't been edited since it was made. MISMATCH means
it has. A folder checks every receipt in it. Notes in the report, like a
source the student didn't confirm, are advisory, not problems.

## 2. Two ways students use it

**On their own.** If your syllabus allows AI and asks students to cite it,
they don't need anything from you. They install it, run `/receipt`, and hand
in a citation and disclosure. This is the path most students take.

**With your policy file.** To set the rules for one assignment, run this in
the folder students work in, like a starter repo:

```
npx -y github:camadkins/promptcite policy init
```

It asks for an AI level (the AIAS, 1 to 5) or a lane (Lane 1 secure, where
you pick the allowed uses; Lane 2 open), plus your rule word for word, and
writes `promptcite.policy.json`. Share that file with the assignment. In a
folder that has it, `/receipt` names the level, quotes your rule, uses your
citation style, and can ask four short reflection questions. Other keys
(allowed uses, required appendices) are in docs/for-instructors.md.

It warns, it never blocks. A student who used AI where your policy says not
to still gets an honest receipt, with your rule quoted next to it.

## A paragraph for your syllabus

> If you use generative AI on an assignment, disclose it with PromptCite
> (github.com/camadkins/promptcite). Install it once, then type `/receipt` in
> your AI tool when you finish. Paste the citation and disclosure it writes
> into your work, and attach the JSON receipt. If the assignment comes with a
> `promptcite.policy.json`, put it in your assignment folder first. Using AI
> where this course doesn't allow it is still better disclosed than hidden.

Edit the last sentence to match your policy. A receipt is the student's own
account. It doesn't verify their AI use, so don't present it as proof.

## 3. If a student hands you a timeline

```
npx -y github:camadkins/promptcite timeline verify promptcite-timeline.json
```

INTACT means the file hasn't been edited since it was made. It doesn't show
when it was made or that it's complete.

## More

The full reading guide is docs/for-instructors.md in the repo.
`promptcite help student` shows what your students see.
