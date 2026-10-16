# ReasonTrace MVP TODO

MVP: import a real agent run, identify where it failed, and share a review with supporting events.

This checklist applies to the code on `main`. Fix correctness before expanding features. Existing archive/rebuild notices may describe the previous branch layout; do not treat them as instructions to switch branches. Mark an item complete only after implementing it and verifying its behavior.

## What needs fixing

- [ ] Preserve explicit, observed, and inferred evidence labels during transcript parsing.
- [ ] Classify assistant chat messages accurately instead of treating every message without tool calls as a final answer.
- [ ] Separate chronological links from evidence dependencies. Do not count an unrelated earlier observation as support for a claim or answer.
- [ ] Correct repeated-tool and repeated-action detection, including the bundled web-agent loop, without treating useful repeated calls as automatic failures.
- [ ] Replace recursion that overflows on large traces and keep diagnostics usable for thousands of events.
- [ ] Preserve manually positioned graph nodes when selecting an event or opening its details.
- [ ] Handle single-event traces without division by zero in the timeline.
- [ ] Show the rule, supporting events, and limitations behind every diagnostic finding; do not present heuristic evidence coverage as verified factual grounding.

## What features to add

- [ ] Add a tool-call inspector pairing requests with arguments, results, errors, and durations when the input provides them.
- [ ] Let users select a finding to focus its events and highlight the relevant dependency path.
- [ ] Add review annotations, failure-point markers, and accepted/dismissed finding states.
- [ ] Export and reopen a portable review containing the source trace, annotations, finding decisions, and format version.
