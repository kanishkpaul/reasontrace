"""Gate: the Gemma Scope 2 SAE reconstructs captured Gemma 3 activations as well as the release reports.

Figure 7 of the Gemma Scope 2 technical paper plots the fraction of variance
unexplained (FVU) of the layer-13 residual SAEs for Gemma 3 1B between about
0.033 and 0.070, across widths and L0s, on pretraining text with special tokens
masked. That is read off a log-scale plot, and these activations come from chat
transcripts, so the band below is widened to 0.02–0.10. It was fixed before
anything was measured.

Skipped where the model runtime, the Gemma 3 weights or the SAE are missing.
"""

import threading

import pytest

torch = pytest.importorskip("torch")
from huggingface_hub import try_to_load_from_cache  # noqa: E402
from safetensors.torch import load_file  # noqa: E402

from reasontrace_sidecar.decoders import sae  # noqa: E402
from reasontrace_sidecar.plan import read_plan  # noqa: E402
from reasontrace_sidecar.runtime import Host, cached_revision  # noqa: E402

FVU_RANGE = (0.02, 0.10)
#: The SAE's config.json gives a target L0 of 60; within a factor of two either way.
L0_RANGE = (30, 120)

PROMPTS = [
    "Explain how a bicycle stays upright.",
    "Write a short poem about the sea.",
    "What is 17 times 23? Show your working.",
    "Give three tips for learning a new language.",
]

SPEC = sae.SAES["gemma-3-1b-it"]


@pytest.fixture(scope="module")
def measured(tmp_path_factory):
    if cached_revision("google/gemma-3-1b-it") is None:
        pytest.skip("google/gemma-3-1b-it is not downloaded")
    if not isinstance(try_to_load_from_cache("google/gemma-scope-2-1b-it", f"resid_post/{SPEC.sae_id}/params.safetensors"), str):
        pytest.skip(f"the Gemma Scope 2 SAE {SPEC.sae_id} is not downloaded")
    host = Host()
    host.load("gemma-3-1b-it")
    specials = set(host.tokenizer.all_special_tokens)
    hidden, special = [], []
    for i, prompt in enumerate(PROMPTS):
        out = tmp_path_factory.mktemp(f"run{i}")
        result = host.run(
            {"model": "gemma-3-1b-it", "prompt": prompt, "maxTokens": 96, "topLogprobs": 0, "tensorsDir": str(out), "plan": {"layers": [SPEC.layer], "positions": "all"}},
            read_plan, lambda channel, text: None, threading.Event(),
        )
        hidden.append(load_file(str(out / "residual.safetensors"), device=host.device)[f"layer.{SPEC.layer}"])
        special += [t in specials for t in result["capture"]["tokens"]]
    loaded = sae.Loaded().get(SPEC, host.device)
    return sae.features(loaded, torch.cat(hidden), special), special


def test_reconstruction_error_is_in_the_reported_range(measured):
    result, _ = measured
    assert FVU_RANGE[0] <= result["fvu"] <= FVU_RANGE[1], result["fvu"]


def test_sparsity_is_near_the_sae_target(measured):
    result, special = measured
    l0 = [n for n, s in zip(result["l0"], special) if not s]
    mean = sum(l0) / len(l0)
    assert L0_RANGE[0] <= mean <= L0_RANGE[1], mean


def test_the_check_can_fail():
    # A reconstruction of zeros explains none of the variance around the mean, and more besides.
    x = torch.randn(64, 8)
    assert sae.fvu(x, torch.zeros_like(x)) > FVU_RANGE[1]
