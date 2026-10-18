"""Capture plans: which layers and positions to keep, and how to pool them.

A full residual stream is about 60 KB per token for Gemma 3 1B, so a plan names
what it keeps (docs/CHARTER.md §3, rule 4).
"""

from dataclasses import dataclass
from typing import Any

from .rpc import INVALID_PARAMS, RpcError

POSITIONS = ("all", "generated", "last")
POOLINGS = ("none", "mean")


@dataclass(frozen=True)
class Plan:
    layers: tuple[int, ...]
    positions: str
    pooling: str

    def as_json(self) -> dict[str, Any]:
        return {"layers": list(self.layers), "positions": self.positions, "pooling": self.pooling}


def read_plan(raw: Any, layer_count: int) -> Plan:
    """A plan from request params, with "all" layers expanded and every layer index checked."""
    if not isinstance(raw, dict):
        raise RpcError(INVALID_PARAMS, "plan must be an object with layers, positions and pooling.")
    layers = raw.get("layers", "all")
    if layers == "all":
        chosen = tuple(range(layer_count))
    elif isinstance(layers, list) and layers and all(isinstance(i, int) and not isinstance(i, bool) for i in layers):
        bad = [i for i in layers if not 0 <= i < layer_count]
        if bad:
            raise RpcError(INVALID_PARAMS, f"plan.layers {bad} are outside 0–{layer_count - 1}.")
        chosen = tuple(sorted(set(layers)))
    else:
        raise RpcError(INVALID_PARAMS, 'plan.layers must be "all" or a non-empty list of layer indices.')
    positions = raw.get("positions", "last")
    if positions not in POSITIONS:
        raise RpcError(INVALID_PARAMS, f"plan.positions must be one of {', '.join(POSITIONS)}.")
    pooling = raw.get("pooling", "none")
    if pooling not in POOLINGS:
        raise RpcError(INVALID_PARAMS, f"plan.pooling must be one of {', '.join(POOLINGS)}.")
    return Plan(chosen, positions, pooling)


def position_indices(plan: Plan, prompt_length: int, total_length: int) -> list[int]:
    """The sequence positions the plan keeps, for a sequence of prompt then generated tokens."""
    if plan.positions == "all":
        return list(range(total_length))
    if plan.positions == "generated":
        return list(range(prompt_length, total_length))
    return [total_length - 1]
