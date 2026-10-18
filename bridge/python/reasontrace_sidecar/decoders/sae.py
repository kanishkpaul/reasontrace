"""Sparse-autoencoder features: Gemma Scope 2 SAEs, loaded and run through SAELens.

Each position's residual stream is encoded into the SAE's features; the
attachment keeps the strongest few per position, how many fired (L0), and how
much of the activations' variance the reconstruction misses (FVU), which is how
the Gemma Scope 2 release reports reconstruction quality. No SAE has a planted
circuit to be validated against, so its features stay unvalidated.
"""

from dataclasses import dataclass
from typing import Any

import torch
from sae_lens import SAE

KIND = "sae.features/1"
NAME = "Gemma Scope 2 SAE"
VERSION = "1"

#: Features kept per position, strongest first.
TOP = 5
#: FVU divides by the activations' variance, which a handful of positions can't estimate.
MIN_FVU_POSITIONS = 16


@dataclass(frozen=True)
class SaeSpec:
    release: str
    sae_id: str
    layer: int
    width: int


#: The release recommends widths of 64k or more and the medium L0 (google/gemma-scope-2-1b-it, README).
SAES = {"gemma-3-1b-it": SaeSpec("gemma-scope-2-1b-it-res", "layer_13_width_65k_l0_medium", 13, 65536)}


class Loaded:
    """Holds one SAE at a time; loading another frees the first."""

    def __init__(self):
        self.spec: SaeSpec | None = None
        self.sae: SAE | None = None

    def get(self, spec: SaeSpec, device: str) -> SAE:
        if self.spec != spec:
            self.sae = None
            self.sae = SAE.from_pretrained(spec.release, spec.sae_id, device=device).eval()
            self.spec = spec
        return self.sae


def fvu(x: torch.Tensor, reconstruction: torch.Tensor) -> float:
    """Fraction of variance unexplained: squared error over the squared distance from the mean of `x`."""
    return (((x - reconstruction) ** 2).sum() / ((x - x.mean(dim=0)) ** 2).sum()).item()


def features(sae: SAE, hidden: torch.Tensor, special: list[bool]) -> dict[str, Any]:
    """The SAE's reading of hidden states [positions, width]. Special tokens are left out of FVU, as the release leaves them out."""
    with torch.no_grad():
        acts = sae.encode(hidden)
        reconstruction = sae.decode(acts)
    values, indices = acts.topk(TOP, dim=-1)
    kept = torch.tensor([not s for s in special], device=hidden.device)
    n = int(kept.sum())
    return {
        "top": [
            [{"feature": int(i), "activation": float(v)} for v, i in zip(vs, ix) if v > 0]
            for vs, ix in zip(values.cpu(), indices.cpu())
        ],
        "l0": (acts > 0).sum(dim=-1).tolist(),
        "special": special,
        "fvu": fvu(hidden[kept], reconstruction[kept]) if n >= MIN_FVU_POSITIONS else None,
        "fvuPositions": n,
    }
