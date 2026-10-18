"""Writes the stored transformers reference that the capture is tested against.

The reference comes from plain transformers on the CPU in float32, with
PyTorch forward hooks on the decoder layers and no nnsight, so the test
compares two independent ways of reading the same activations.

Usage: uv run --extra model python scripts/make_reference.py
"""

import json
from pathlib import Path

import torch
from huggingface_hub import snapshot_download
from safetensors.torch import save_file
from transformers import AutoModelForCausalLM, AutoTokenizer

REPO = "Qwen/Qwen3-0.6B"
PROMPT = "What is the capital of France?"
LAYERS = [0, 13, 27]
OUT = Path(__file__).resolve().parents[3] / "fixtures" / "tensors" / "qwen3-0.6b-residual-reference.safetensors"


def main() -> None:
    path = snapshot_download(REPO, allow_patterns=["*.json", "*.safetensors", "tokenizer*", "*.txt"], local_files_only=True)
    tokenizer = AutoTokenizer.from_pretrained(path)
    model = AutoModelForCausalLM.from_pretrained(path, dtype=torch.float32).eval()
    text = tokenizer.apply_chat_template([{"role": "user", "content": PROMPT}], tokenize=False, add_generation_prompt=True, enable_thinking=True)
    ids = tokenizer(text, return_tensors="pt", add_special_tokens=False).input_ids

    outputs = {}
    hooks = [
        model.model.layers[i].register_forward_hook(lambda module, args, output, i=i: outputs.__setitem__(i, output[0] if isinstance(output, tuple) else output))
        for i in LAYERS
    ]
    with torch.no_grad():
        model(ids)
    for hook in hooks:
        hook.remove()

    tensors = {f"layer.{i}": outputs[i][0].float().contiguous() for i in LAYERS}
    tensors["input_ids"] = ids[0].to(torch.int64).contiguous()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    save_file(tensors, str(OUT), metadata={
        "repo": REPO,
        "revision": Path(path).name,
        "prompt": PROMPT,
        "device": "cpu",
        "dtype": "float32",
        "method": "transformers forward pass with PyTorch forward hooks on model.model.layers",
        "layers": json.dumps(LAYERS),
    })
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {ids.shape[1]} positions)")


if __name__ == "__main__":
    main()
