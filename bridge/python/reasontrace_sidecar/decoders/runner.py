"""Runs the decoders over what a run directory holds and adds one attachment file per decoder (docs/ARCHITECTURE.md §3).

It reads the residual stream the run captured, so it works on any finished
run of a supported model, and it never rewrites what the run captured.
"""

import json
from functools import cache
from pathlib import Path
from typing import Any

from safetensors.torch import load_file

from ..ground_truth import harness, planted
from ..rpc import INVALID_PARAMS, RpcError
from . import logit_lens, sae

#: Tokens kept per layer and position by the logit lens.
LENS_TOP = 5


@cache
def lens_validation() -> dict[str, Any]:
    """The logit lens's result on the planted circuit, computed once per process by the code that decodes."""
    return harness.validate(planted.planted_model(), planted.task())


def residual_attachment(run_dir: Path) -> dict[str, Any]:
    path = run_dir / "attachments" / "source.jsonl"
    attachments = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
    found = next((a for a in attachments if a["kind"] == "activations.residual/1"), None)
    if found is None:
        raise RpcError(INVALID_PARAMS, "The run captured no residual stream, so there is nothing to decode.")
    return found


def write(run_dir: Path, attachment: dict[str, Any]) -> None:
    name = attachment["kind"].replace("/", "-")
    (run_dir / "attachments" / f"{name}.jsonl").write_text(json.dumps(attachment) + "\n")


def decode_run(host, run_dir: Path, saes: sae.Loaded) -> list[dict[str, Any]]:
    """Decodes the run in `run_dir` with every decoder. Answers, for each, whether it attached and if not, why."""
    manifest = json.loads((run_dir / "manifest.json").read_text())
    model_id = manifest["request"]["model"]
    capture = residual_attachment(run_dir)
    data = capture["data"]
    if data["pooling"] != "none":
        reason = "The run kept the mean over positions, which is not a state the model was ever in, so it is not decoded."
        return [{"kind": kind, "attached": False, "reason": reason} for kind in (logit_lens.KIND, sae.KIND)]

    host.load(model_id)
    tensors = load_file(str(run_dir / data["file"]), device=host.device)
    tokens = data["tokens"]
    common = {"eventId": capture["eventId"], "label": "decoded"}

    via = logit_lens.readout(host.hf)
    top = []
    for layer in data["layers"]:
        values, ids = logit_lens.top(tensors[f"layer.{layer}"], via, LENS_TOP)
        top.append([
            [{"token": host.tokenizer.decode([int(i)]), "logprob": float(v)} for v, i in zip(vs, ix)]
            for vs, ix in zip(values.cpu(), ids.cpu())
        ])
    write(run_dir, {
        "kind": logit_lens.KIND,
        **common,
        "method": {"name": logit_lens.NAME, "version": logit_lens.VERSION},
        "validation": lens_validation(),
        "data": {"layers": data["layers"], "positions": data["positions"], "tokens": tokens, "top": top},
    })
    outcomes = [{"kind": logit_lens.KIND, "attached": True, "reason": None}]

    spec = sae.SAES.get(model_id)
    if spec is None:
        reason = f"Gemma Scope 2 has SAEs for Gemma 3 only, not {model_id}."
    elif spec.layer not in data["layers"]:
        reason = f"The SAE reads layer {spec.layer}, which this run's capture plan left out."
    else:
        special_tokens = set(host.tokenizer.all_special_tokens)
        hidden = tensors[f"layer.{spec.layer}"]
        write(run_dir, {
            "kind": sae.KIND,
            **common,
            "method": {"name": sae.NAME, "version": sae.VERSION},
            "validation": None,
            "data": {
                "release": spec.release,
                "saeId": spec.sae_id,
                "layer": spec.layer,
                "width": spec.width,
                "positions": data["positions"],
                "tokens": tokens,
                **sae.features(saes.get(spec, host.device), hidden, [t in special_tokens for t in tokens]),
            },
        })
        reason = None
    outcomes.append({"kind": sae.KIND, "attached": reason is None, "reason": reason})
    return outcomes
