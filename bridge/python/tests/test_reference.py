"""Gate: captured activations match the stored transformers reference.

The reference (fixtures/tensors/qwen3-0.6b-residual-reference.safetensors) is a
CPU float32 forward pass with PyTorch hooks and no nnsight; see
scripts/make_reference.py. The capture runs through nnsight on whatever device
this machine has. Skipped where the model runtime or the weights are missing.
"""

import json
from pathlib import Path

import pytest

torch = pytest.importorskip("torch")
from safetensors import safe_open  # noqa: E402
from safetensors.torch import load_file  # noqa: E402

from reasontrace_sidecar.plan import Plan  # noqa: E402
from reasontrace_sidecar.runtime import Host, cached_revision  # noqa: E402

REFERENCE = Path(__file__).resolve().parents[3] / "fixtures" / "tensors" / "qwen3-0.6b-residual-reference.safetensors"

#: Largest allowed difference, as a fraction of the layer's largest absolute
#: value. MPS against the CPU measured 7e-6 at worst (layer 27, 2026-10-18).
TOLERANCE = 1e-4


def relative_difference(a, b) -> float:
    return ((a - b).abs().max() / b.abs().max()).item()


@pytest.fixture(scope="module")
def captured(tmp_path_factory):
    with safe_open(str(REFERENCE), "pt") as f:
        meta = f.metadata()
    if cached_revision(meta["repo"]) != meta["revision"]:
        pytest.skip(f"{meta['repo']} at {meta['revision']} is not downloaded")
    reference = load_file(str(REFERENCE))
    layers = tuple(json.loads(meta["layers"]))
    host = Host()
    host.load("qwen3-0.6b")
    ids = reference["input_ids"].unsqueeze(0).to(host.device)
    out = tmp_path_factory.mktemp("capture") / "residual.safetensors"
    host.capture(ids, Plan(layers, "all", "none"), ids.shape[1], out)
    return reference, load_file(str(out)), layers


def test_capture_matches_the_reference_within_tolerance(captured):
    reference, got, layers = captured
    for i in layers:
        name = f"layer.{i}"
        assert got[name].shape == reference[name].shape
        assert relative_difference(got[name], reference[name]) <= TOLERANCE, name


def test_the_comparison_can_fail(captured):
    reference, got, _ = captured
    assert relative_difference(got["layer.13"], reference["layer.27"]) > TOLERANCE
