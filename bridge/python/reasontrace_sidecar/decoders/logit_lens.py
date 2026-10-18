"""The logit lens: reads a layer's hidden state as if it were the last layer's,
through the model's final norm and unembedding (nostalgebraist, 2020).

It sees only what lies in the unembedding's span. A variable a model holds in
some other basis is invisible to it, so a lens that finds nothing has not shown
that nothing is there.
"""

from dataclasses import dataclass

import torch

KIND = "lens.logit/1"
NAME = "logit lens"
VERSION = "1"


@dataclass(frozen=True)
class Readout:
    norm: torch.nn.Module
    #: [vocabulary, width]
    unembed: torch.Tensor


def readout(model) -> Readout:
    """The final norm and unembedding of a transformers causal LM, kept at `model.norm` and `lm_head` in every supported family."""
    return Readout(model.model.norm, model.lm_head.weight)


def logits(hidden: torch.Tensor, via: Readout) -> torch.Tensor:
    """Token logits for hidden states of shape [..., width]."""
    with torch.no_grad():
        return via.norm(hidden) @ via.unembed.T
