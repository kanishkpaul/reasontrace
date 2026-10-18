"""Splits reasoning text into sentence-level steps and finds the token each step ends on.

A step ends at sentence-ending punctuation followed by whitespace, or at a line
break. A full stop between digits (9.11) or after a list number at the start of
a line ("1. ") does not end one.
"""

import re

#: Punctuation ending a sentence, the whitespace after it, or a run of line breaks.
BOUNDARY = re.compile(r"(?<=[.!?])[\"')\]]*(?=\s)|\n+")
LIST_NUMBER = re.compile(r"(?:^|\n)\s*\d+\.$")


def sentences(text: str) -> list[tuple[int, int]]:
    """Each step as a [start, end) span of `text`, without its surrounding whitespace. Empty steps are dropped."""
    spans = []
    start = 0
    for match in BOUNDARY.finditer(text):
        if text[match.start() - 1 : match.start()] == "." and LIST_NUMBER.search(text[: match.start()]):
            continue
        spans.append((start, match.start() if match.group().startswith("\n") else match.end()))
        start = match.end()
    spans.append((start, len(text)))
    trimmed = []
    for a, b in spans:
        while a < b and text[a].isspace():
            a += 1
        while b > a and text[b - 1].isspace():
            b -= 1
        if a < b:
            trimmed.append((a, b))
    return trimmed


def token_ends(offsets: list[int], spans: list[tuple[int, int]]) -> list[int]:
    """For each span, the index of the token whose text reaches its end.

    `offsets[i]` is the length of the text decoded from tokens 0..i, so token i
    covers characters offsets[i-1] to offsets[i].
    """
    ends = []
    i = 0
    for _, end in spans:
        while offsets[i] < end:
            i += 1
        ends.append(i)
    return ends
