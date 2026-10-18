"""When does a model commit to its answer? The rules of the answer-commitment finding, free of torch.

Each problem's answer is one digit. At the end of each reasoning step, and at
the position just before the answer is emitted, the logit lens reads the ten
digit tokens at every layer. Two commitment points are compared:

- **internal**: the first step from which the model's own final answer is the
  top digit at most layers of the network's second half, at every step after.
  This is `decoded` evidence.
- **stated**: the first step whose text states the answer as a number. This is
  a text heuristic, so it is `inferred`.

The same rules are applied to three controls, which should not find the answer.
"""

import re
from typing import Any

from ..ground_truth.verdict import chance_bound, verdict

#: (a, b, c): what is a + b - c. Answers are 0-9, twice each, and the answer's
#: digit appears in none of a, b, c or a + b, so a step that states it is not
#: just repeating the question or the sum.
PROBLEMS = [
    (17, 34, 51), (43, 24, 66), (38, 37, 73), (16, 46, 59), (37, 20, 53),
    (47, 30, 72), (34, 17, 45), (46, 15, 54), (47, 14, 53), (24, 42, 57),
    (45, 38, 83), (48, 40, 87), (47, 30, 75), (29, 49, 75), (15, 18, 29),
    (47, 31, 73), (49, 42, 85), (48, 40, 81), (15, 16, 23), (30, 47, 68),
]
PROMPT = "What is {a} + {b} - {c}? Answer with a single digit."
DIGITS = [str(d) for d in range(10)]
CHANCE = 1 / len(DIGITS)

INTERNAL_RULE = (
    "The first step from which the model's final answer is the top digit, under the logit lens restricted to the ten digit tokens, "
    "at most layers of the network's second half, at that step and every one after it, through the position before the answer."
)
STATED_RULE = "The first reasoning step whose text contains the answer as a number on its own (not part of a longer number). A text heuristic."


def answer_of(output: str) -> int | None:
    """The model's answer: the number in its last `\\boxed{}`, or else its last number. None unless that is one digit.

    Small models show their working after the reasoning too, so the answer is
    the number they end on.
    """
    boxed = re.findall(r"\\boxed\{\s*(-?[\d.]+)\s*\}", output)
    numbers = boxed or re.findall(r"(?<![\d.])-?\d+(?:\.\d+)?(?![\d.])", output)
    return int(numbers[-1]) if numbers and re.fullmatch(r"\d", numbers[-1]) else None


def states(text: str, answer: int) -> bool:
    return re.search(rf"(?<![\d.]){answer}(?!\.?\d)", text) is not None


def decodable(top_by_layer: list[int], answer: int) -> bool:
    """Whether `answer` is the top digit at most layers of the second half."""
    late = top_by_layer[len(top_by_layer) // 2 :]
    return sum(top == answer for top in late) * 2 > len(late)


def internal_commitment(flags: list[bool]) -> int | None:
    """The first index from which every flag is true, or None when the last is false."""
    first = None
    for i, flag in enumerate(flags):
        if not flag:
            first = None
        elif first is None:
            first = i
    return first


def stated_commitment(step_texts: list[str], answer: int) -> int | None:
    return next((i for i, text in enumerate(step_texts) if states(text, answer)), None)


def shuffled(answers: list[int]) -> list[int]:
    """Each problem's answer replaced by the next problem's answer that differs from it, cyclically."""
    n = len(answers)
    out = []
    for i, answer in enumerate(answers):
        other = next((answers[(i + k) % n] for k in range(1, n) if answers[(i + k) % n] != answer), None)
        if other is None:
            raise ValueError("Shuffling needs at least two different answers.")
        out.append(other)
    return out


def measure(problems: list[dict[str, Any]], tops: str, answers: list[int]) -> dict[str, float]:
    """The rules' results over the problems, reading `tops` (the real readout or a control's) against `answers`.

    - atAnswer: share of problems where the answer is decodable at the position before it is emitted.
    - steps: share of reasoning steps where it is decodable.
    - beforeStated: share of problems with a stated commitment whose internal commitment comes earlier.
    """
    at_answer = steps = decodable_steps = before = with_stated = 0
    for problem, answer in zip(problems, answers):
        flags = [decodable(step[tops], answer) for step in problem["steps"]]
        last = decodable(problem["answerStep"][tops], answer)
        at_answer += last
        steps += len(flags)
        decodable_steps += sum(flags)
        stated = stated_commitment([step["text"] for step in problem["steps"]], answer)
        internal = internal_commitment(flags + [last])
        if stated is not None:
            with_stated += 1
            before += internal is not None and internal < stated
    return {
        "atAnswer": at_answer / len(problems),
        "steps": decodable_steps / steps if steps else 0.0,
        "beforeStated": before / with_stated if with_stated else 0.0,
    }


def summarise(problems: list[dict[str, Any]]) -> dict[str, Any]:
    """Results for the answered problems, each control's, and whether the readout is validated at the answer position."""
    answered = [p for p in problems if p["answer"] is not None]
    answers = [p["answer"] for p in answered]
    real = measure(answered, "top", answers)
    controls = {
        "shuffled inputs": measure(answered, "top", shuffled(answers)),
        "random direction": measure(answered, "randomTop", answers),
        "untrained weights": measure(answered, "untrainedTop", answers),
    }
    bound = chance_bound(len(answered), CHANCE, tests=len(controls))
    status, reason = verdict(real["atAnswer"], {name: c["atAnswer"] for name, c in controls.items()}, bound, target="the model's answer")
    return {
        "answered": len(answered),
        "real": real,
        "controls": [{"control": name, **c, "succeeded": c["atAnswer"] >= bound} for name, c in controls.items()],
        "chance": CHANCE,
        "chanceBound": bound,
        "status": status,
        "reason": reason,
    }
