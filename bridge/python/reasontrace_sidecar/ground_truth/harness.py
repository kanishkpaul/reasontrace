"""Runs the logit lens against the planted circuit and its controls, and says whether it is validated.

The result is what a decoder attachment carries as its `validation`
(packages/format, `Validation`).
"""

from typing import Any

import torch
from nnsight import NNsight

from ..decoders import logit_lens
from ..runtime import residual
from . import controls
from .planted import Task
from .verdict import REQUIRED, chance_bound, verdict

METRIC = "top-1 accuracy of the decoded token against the planted variable, at the last position"


def last_position(model, prompts: torch.Tensor) -> list[torch.Tensor]:
    """Each layer's hidden state at the last position, [items, width], captured as real runs are."""
    layers = range(len(model.model.layers))
    saved = residual(NNsight(model), prompts, layers)
    return [saved[i][:, -1, :] for i in layers]


def accuracy(hidden: torch.Tensor, via: logit_lens.Readout, labels: torch.Tensor) -> float:
    return (logit_lens.logits(hidden, via).argmax(dim=-1) == labels).float().mean().item()


def validate(model, task: Task, seed: int = 0) -> dict[str, Any]:
    hidden = last_position(model, task.prompts)
    via = logit_lens.readout(model)
    by_layer = [accuracy(h, via, task.labels) for h in hidden]
    recovered = [i for i, score in enumerate(by_layer) if score >= REQUIRED]
    # Controls are scored where the decoder claims the variable, or at its best layer when it claims none.
    claimed = recovered or [max(range(len(by_layer)), key=by_layer.__getitem__)]

    random_model = controls.untrained_weights(model, seed)
    untrained = last_position(random_model, task.prompts)
    untrained_via = logit_lens.readout(random_model)
    random_via = controls.random_direction(via, seed)
    shuffled = controls.shuffled_inputs(task.labels, seed)
    scores = {
        controls.RANDOM_DIRECTION: max(accuracy(hidden[i], random_via, task.labels) for i in claimed),
        controls.SHUFFLED_INPUTS: max(accuracy(hidden[i], via, shuffled) for i in claimed),
        controls.UNTRAINED_WEIGHTS: max(accuracy(untrained[i], untrained_via, task.labels) for i in claimed),
    }

    chance = 1 / via.unembed.shape[0]
    bound = chance_bound(len(task.labels), chance, tests=len(scores) * len(claimed))
    score = max(by_layer)
    status, reason = verdict(score, scores, bound)
    return {
        "decoder": {"kind": logit_lens.KIND, "name": logit_lens.NAME, "version": logit_lens.VERSION},
        "status": status,
        "reason": reason,
        "groundTruth": task.description,
        "metric": METRIC,
        "items": len(task.labels),
        "score": score,
        "required": REQUIRED,
        "chance": chance,
        "chanceBound": bound,
        "byLayer": by_layer,
        "recoveredFrom": recovered[0] if recovered else None,
        "controls": [{"control": name, "score": scores[name], "succeeded": scores[name] >= bound} for name in controls.CONTROLS],
    }
