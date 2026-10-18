"""Whether a decoder counts as validated, from its score on the planted circuit and its controls' scores.

Kept free of torch, so the rule is tested without the model runtime.
"""

from math import comb

#: The accuracy a decoder needs on the planted circuit to count as recovering it.
REQUIRED = 0.9

#: The chance, over all controls and layers together, that a control which decodes
#: nothing is still counted as succeeding.
ALPHA = 0.01


def chance_bound(n: int, chance: float, tests: int) -> float:
    """The smallest accuracy that a decoder guessing at `chance` reaches on `n` items with probability at most ALPHA/`tests`.

    `tests` is the number of scores compared with the bound, so that checking
    many layers and controls doesn't make a lucky control likelier (Bonferroni).
    """
    alpha = ALPHA / tests

    def tail(k: int) -> float:
        return sum(comb(n, i) * chance**i * (1 - chance) ** (n - i) for i in range(k, n + 1))

    k = next(k for k in range(n + 1) if tail(k) <= alpha)
    return k / n


def verdict(score: float, controls: dict[str, float], bound: float, target: str = "the planted variable") -> tuple[str, str | None]:
    """`("validated", None)`, or `("unvalidated", reason)`. `target` names what the decoder was meant to recover."""
    if score < REQUIRED:
        return "unvalidated", f"It recovered {target} in {score:.0%} of cases, short of the {REQUIRED:.0%} required."
    succeeded = [name for name, control in controls.items() if control >= bound]
    if succeeded:
        listed = ", ".join(f"{name} ({controls[name]:.0%})" for name in succeeded)
        return "unvalidated", (
            f"A control decoded the variable too: {listed}, against a chance bound of {bound:.0%}. "
            "The decoder may be reading something other than the variable."
        )
    return "validated", None
