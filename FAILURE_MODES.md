# Failure modes

How the people and agents working on this repository get things wrong: the
tell for each mistake, and the check that catches it. Read this before writing
a claim, a summary, or a decision about what the code does.

Rows F-A to F-C come from the Daedalus project, where each one caused real
defects. The others are specific to interpretability work. Add a row when a
mistake happens twice, or once with consequences.

---

## The one underneath the others

**Fluent prose is produced faster than verification, and reads as though the
verification happened.** A confident sentence about code is not evidence about
the code. In this tool the stakes are higher than usual: an unchecked claim
shown in the viewer becomes a finding about a model.

## F-A · Asserting a property of code that was read but never run

**Tell:** superlatives and closure claims, such as "this is the only caller",
"this settles it", or "the capture is deterministic".
**Check:** run something that fails if the claim is false. A three-line script
counts. A claim that cannot be made to fail is not a claim yet.

## F-B · Inferring one quantity from another with a similar name

**Tell:** the subject changes partway through a chain of reasoning. For
example, "the feature fires on the answer token, so the model uses the
feature".
**Check:** name the quantity in one sentence: whose property it is, given
what. Then check that the number you are citing is about that quantity.

## F-C · Dropping a qualifier the source insisted on

**Tell:** a summary reads stronger than its source. "Probes detect deception"
loses "on these contrast prompts, at this false-positive rate".
**Check:** quote the source's hedge next to the summary, and keep it.

## F-D · Treating decodable as used

**Tell:** "layer 12 knows the answer" because a lens or probe reads it there.
**Check:** a control, and preferably an intervention. Decodability is
`decoded` evidence until ablating or steering the direction changes behaviour.

## F-E · Reading stated reasoning as the reasoning

**Tell:** a provider's thinking summary, or a model's chain of thought,
described as what the model did.
**Check:** it carries the `stated` label everywhere it appears, including in
prose. Summaries from frontier APIs are written by another model.

## F-F · A silent capability downgrade

**Tell:** a panel that renders empty, or zero, for a depth the source never
provided.
**Check:** every depth renders from declared capabilities. An absent depth is
`unavailable` with a reason, and a test asserts it.

## F-G · A configuration change passed off as a repeat run

**Tell:** two runs compared as if identical when the cache, quantization,
batch size or device differed.
**Check:** the determinism check compares manifests first and refuses to call
runs repeats when their configurations differ.
