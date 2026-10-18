"""Splitting a reply's tokens into reasoning and answer at the think tags."""

from typing import Any, Callable


def split_reasoning(
    tokens: list[dict[str, Any]], think: tuple[int, int] | None, decode: Callable[[list[int]], str]
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """Reasoning and answer, each with its text and tokens.

    Reasoning is None when the reply doesn't open with the think tag. The tag
    tokens go with reasoning, so the answer's tokens are exactly the answer.
    Text is decoded from the ids together, not joined token by token, so a
    character split across tokens decodes whole.
    """
    text = lambda part: decode([t["id"] for t in part]).strip()
    if not think or not tokens or tokens[0]["id"] != think[0]:
        return None, {"text": text(tokens), "tokens": tokens}
    end = next((i for i, t in enumerate(tokens) if t["id"] == think[1]), None)
    cut = len(tokens) if end is None else end + 1
    reasoning = {"text": text(tokens[1:cut - 1] if end is not None else tokens[1:]), "tokens": tokens[:cut], "closed": end is not None}
    rest = tokens[cut:]
    return reasoning, {"text": text(rest), "tokens": rest}
