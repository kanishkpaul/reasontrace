"""The decoders on real runs. Skipped where the model runtime is missing; the lens test also needs the Qwen3 0.6B weights."""

import json
from pathlib import Path

import pytest

torch = pytest.importorskip("torch")
from reasontrace_sidecar.decoders import logit_lens, runner  # noqa: E402
from reasontrace_sidecar.rpc import RpcError  # noqa: E402
from reasontrace_sidecar.runtime import Host, cached_revision, residual  # noqa: E402


def run_dir(tmp_path: Path, attachments: list[dict]) -> Path:
    (tmp_path / "attachments").mkdir()
    (tmp_path / "manifest.json").write_text(json.dumps({"request": {"model": "qwen3-0.6b"}}))
    (tmp_path / "attachments" / "source.jsonl").write_text("".join(json.dumps(a) + "\n" for a in attachments))
    return tmp_path


def test_a_run_without_a_residual_stream_is_refused(tmp_path):
    with pytest.raises(RpcError, match="captured no residual stream"):
        runner.decode_run(None, run_dir(tmp_path, []), None)


def test_a_mean_over_positions_is_not_decoded(tmp_path):
    pooled = {"kind": "activations.residual/1", "eventId": "activations", "label": "measured", "data": {"pooling": "mean"}}
    outcomes = runner.decode_run(None, run_dir(tmp_path, [pooled]), None)
    assert [o["attached"] for o in outcomes] == [False, False]
    assert all("mean over positions" in o["reason"] for o in outcomes)


@pytest.mark.skipif(cached_revision("Qwen/Qwen3-0.6B") is None, reason="Qwen/Qwen3-0.6B is not downloaded")
def test_the_lens_at_the_last_layer_is_the_models_own_output():
    host = Host()
    host.load("qwen3-0.6b")
    ids = host.prompt_ids("What is the capital of France?")
    last = len(host.layers()) - 1
    hidden = residual(host.lm, ids, [last])[last][0]
    with torch.no_grad():
        expected = host.hf(ids).logits[0]
    lens = logit_lens.logits(hidden, logit_lens.readout(host.hf))
    assert torch.allclose(lens, expected, rtol=1e-4, atol=1e-3)
    # And not at an earlier layer, so the comparison can fail.
    early = logit_lens.logits(residual(host.lm, ids, [last // 2])[last // 2][0], logit_lens.readout(host.hf))
    assert not torch.allclose(early, expected, rtol=1e-4, atol=1e-3)
