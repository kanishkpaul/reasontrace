"""Controls: the decoder run where there is nothing to find (docs/CHARTER.md §3, rule 1).

Each should fail. One that succeeds means the decoder can produce the answer
without reading the variable, so its success on the real model says nothing.
They work on any transformers causal LM, so later phases reuse them on real models.
"""

import torch

from ..decoders.logit_lens import Readout

RANDOM_DIRECTION = "random direction"
SHUFFLED_INPUTS = "shuffled inputs"
UNTRAINED_WEIGHTS = "untrained weights"

CONTROLS = (RANDOM_DIRECTION, SHUFFLED_INPUTS, UNTRAINED_WEIGHTS)


def random_direction(via: Readout, seed: int) -> Readout:
    """The readout with each unembedding row replaced by a random direction of the same length."""
    generator = torch.Generator().manual_seed(seed)
    random = torch.randn(via.unembed.shape, generator=generator, dtype=via.unembed.dtype).to(via.unembed.device)
    random = random / random.norm(dim=1, keepdim=True) * via.unembed.norm(dim=1, keepdim=True)
    return Readout(via.norm, random)


def shuffled_inputs(labels: torch.Tensor, seed: int) -> torch.Tensor:
    """The labels in a random order, so each input is scored against another input's variable."""
    generator = torch.Generator().manual_seed(seed)
    return labels[torch.randperm(len(labels), generator=generator)]


def untrained_weights(model, seed: int):
    """The model's architecture with random weights, from transformers' own initialisation."""
    torch.manual_seed(seed)
    return type(model)(model.config).eval()
