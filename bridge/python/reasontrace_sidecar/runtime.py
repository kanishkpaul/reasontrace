"""Loads models, generates with token probabilities, and captures the residual stream.

Generation goes through transformers; capture goes through nnsight, as a
second, teacher-forced forward pass over the prompt and the generated tokens.
Keeping the two paths apart is what lets the reference test compare nnsight's
capture with transformers' own hidden states.
"""

import platform
import resource
import sys
import threading
from dataclasses import dataclass
from importlib.metadata import version
from pathlib import Path
from typing import Any, Callable

import torch
from huggingface_hub import snapshot_download, try_to_load_from_cache
from nnsight import TransformersModel
from safetensors.torch import save_file
from transformers import AutoModelForCausalLM, AutoTokenizer, StoppingCriteria, StoppingCriteriaList
from transformers.generation.streamers import BaseStreamer

from .plan import Plan, position_indices
from .think import split_reasoning
from .rpc import INVALID_PARAMS, UNAVAILABLE, RpcError


@dataclass(frozen=True)
class ModelSpec:
    id: str
    repo: str
    name: str
    #: Extra arguments to the chat template; Qwen3 thinks only when asked to.
    template_args: dict[str, Any]
    #: Why the model has no stated depth, when it emits no reasoning text.
    no_reasoning: str | None


MODELS = {
    spec.id: spec
    for spec in [
        ModelSpec("qwen3-0.6b", "Qwen/Qwen3-0.6B", "Qwen3 0.6B", {"enable_thinking": True}, None),
        ModelSpec("gemma-3-1b-it", "google/gemma-3-1b-it", "Gemma 3 1B instruct", {}, "Gemma 3 1B instruct emits no reasoning text before its answer."),
    ]
}

#: Weights stay in float32 on every device, so captures compare tightly with the reference.
DTYPE = torch.float32
CAPTURE_METHOD = "nnsight trace of a teacher-forced forward pass over the prompt and generated tokens, after generation"


def device_name() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def libraries() -> dict[str, str]:
    names = ["torch", "transformers", "nnsight", "safetensors", "huggingface-hub"]
    return {"python": platform.python_version(), **{name: version(name) for name in names}}


def cached_revision(repo: str) -> str | None:
    """The commit of the locally cached snapshot, or None when the weights aren't downloaded."""
    config = try_to_load_from_cache(repo, "config.json")
    return Path(config).parent.name if isinstance(config, str) else None


def residual(lm, ids: torch.Tensor, layers) -> dict[int, torch.Tensor]:
    """The output of each of `layers`, [batch, sequence, width], read through nnsight from `lm`, an nnsight-wrapped model."""
    saved = {}
    with torch.no_grad(), lm.trace(ids):
        for i in layers:
            saved[i] = lm.model.layers[i].output.save()
    return saved


class MemoryGauge:
    """The largest memory figure seen at the moments it was sampled.

    MPS has no peak counter, so the gauge samples the driver's allocation at
    each generated token and after capture; the true peak can sit between samples.
    """

    def __init__(self, device: str):
        self.device = device
        self.peak = 0

    def sample(self) -> None:
        if self.device == "mps":
            current = torch.mps.driver_allocated_memory()
        elif self.device == "cuda":
            current = torch.cuda.max_memory_allocated()
        else:
            # ru_maxrss is bytes on macOS and kilobytes on Linux.
            rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            current = rss if sys.platform == "darwin" else rss * 1024
        self.peak = max(self.peak, current)


class DeltaStreamer(BaseStreamer):
    """Sends generated text as it arrives, split into reasoning and answer at the think tags."""

    def __init__(self, tokenizer, send: Callable[[str, str], None], gauge: MemoryGauge, think: tuple[int, int] | None):
        self.tokenizer = tokenizer
        self.send = send
        self.gauge = gauge
        self.think = think
        self.channel = "output"
        self.ids: list[int] = []
        self.sent = ""
        self.prompt_seen = False

    def put(self, value: torch.Tensor) -> None:
        # The first call carries the prompt.
        if not self.prompt_seen:
            self.prompt_seen = True
            return
        for token in value.reshape(-1).tolist():
            self.gauge.sample()
            if self.think and token == self.think[0]:
                self._flush()
                self.channel = "reasoning"
                continue
            if self.think and token == self.think[1]:
                self._flush()
                self.channel = "output"
                continue
            self.ids.append(token)
            text = self.tokenizer.decode(self.ids, skip_special_tokens=True)
            # Hold back text ending in a partial UTF-8 character.
            if text and not text.endswith("�"):
                self.send(self.channel, text[len(self.sent):])
                self.sent = text

    def _flush(self) -> None:
        self.ids = []
        self.sent = ""

    def end(self) -> None:
        pass


class Cancelled(StoppingCriteria):
    def __init__(self, event: threading.Event):
        self.event = event

    def __call__(self, input_ids, scores, **kwargs) -> bool:
        return self.event.is_set()


class Host:
    """Holds one loaded model at a time; loading another frees the first."""

    def __init__(self):
        self.device = device_name()
        self.spec: ModelSpec | None = None
        self.lm: TransformersModel | None = None
        self.revision: str | None = None

    def load(self, model_id: str) -> None:
        spec = MODELS.get(model_id)
        if spec is None:
            raise RpcError(INVALID_PARAMS, f"Unknown model {model_id!r}. Known: {', '.join(MODELS)}.")
        if self.spec == spec:
            return
        self.lm = None
        patterns = ["*.json", "*.safetensors", "tokenizer*", "*.model", "*.txt"]
        try:
            # The cached copy first, so a downloaded model runs offline.
            path = snapshot_download(spec.repo, allow_patterns=patterns, local_files_only=True)
        except Exception:
            try:
                path = snapshot_download(spec.repo, allow_patterns=patterns)
            except Exception as e:
                raise RpcError(UNAVAILABLE, f"Could not get {spec.repo} from Hugging Face: {type(e).__name__}: {e}") from e
        model = AutoModelForCausalLM.from_pretrained(path, dtype=DTYPE).to(self.device).eval()
        tokenizer = AutoTokenizer.from_pretrained(path)
        self.lm = TransformersModel(model, task="text-generation", tokenizer=tokenizer)
        self.hf = model
        self.tokenizer = tokenizer
        self.spec = spec
        self.revision = Path(path).name

    def layers(self):
        """The decoder layers, which every supported model keeps at `model.layers`."""
        return self.lm.model.layers

    def think_ids(self) -> tuple[int, int] | None:
        vocab = self.tokenizer.get_vocab()
        if "<think>" in vocab and "</think>" in vocab:
            return vocab["<think>"], vocab["</think>"]
        return None

    def prompt_ids(self, prompt: str) -> torch.Tensor:
        text = self.tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}], tokenize=False, add_generation_prompt=True, **self.spec.template_args
        )
        return self.tokenizer(text, return_tensors="pt", add_special_tokens=False).input_ids.to(self.device)

    def capture(self, ids: torch.Tensor, plan: Plan, prompt_length: int, path: Path) -> dict[str, Any]:
        """Saves the plan's residual-stream slices as safetensors and describes them."""
        total = ids.shape[1]
        positions = position_indices(plan, prompt_length, total)
        if not positions:
            raise RpcError(INVALID_PARAMS, "The plan keeps generated positions, and the model generated none.")
        saved = residual(self.lm, ids, plan.layers)
        tensors = {}
        for i in plan.layers:
            hidden = saved[i][0, positions, :].float()
            if plan.pooling == "mean":
                hidden = hidden.mean(dim=0, keepdim=True)
            tensors[f"layer.{i}"] = hidden.detach().cpu().contiguous()
        path.parent.mkdir(parents=True, exist_ok=True)
        save_file(tensors, str(path), metadata={"capture": CAPTURE_METHOD})
        last = {name: float(t[-1].norm()) for name, t in tensors.items()}
        return {
            "layers": list(plan.layers),
            "positions": positions,
            "pooling": plan.pooling,
            "dModel": int(next(iter(tensors.values())).shape[-1]),
            "dtype": "float32",
            "norms": [last[f"layer.{i}"] for i in plan.layers],
        }

    def run(self, params: dict[str, Any], plan_reader, send: Callable[[str, str], None], cancel: threading.Event) -> dict[str, Any]:
        self.load(params["model"])
        plan = plan_reader(params.get("plan", {}), len(self.layers()))
        gauge = MemoryGauge(self.device)
        ids = self.prompt_ids(params["prompt"])
        prompt_length = ids.shape[1]
        temperature = params.get("temperature") or 0
        seed = params.get("seed", 0)
        top_k = params.get("topLogprobs", 5)
        generation = {
            "max_new_tokens": params["maxTokens"],
            "do_sample": temperature > 0,
            "use_cache": params.get("cache", True),
            **({"temperature": temperature, "top_p": 1.0, "top_k": 0} if temperature > 0 else {}),
        }
        torch.manual_seed(seed)
        streamer = DeltaStreamer(self.tokenizer, send, gauge, self.think_ids())
        with torch.no_grad():
            out = self.hf.generate(
                ids,
                **generation,
                attention_mask=torch.ones_like(ids),
                output_logits=True,
                return_dict_in_generate=True,
                streamer=streamer,
                stopping_criteria=StoppingCriteriaList([Cancelled(cancel)]),
                pad_token_id=self.tokenizer.pad_token_id or self.tokenizer.eos_token_id,
            )
        sequence = out.sequences
        generated = sequence[0, prompt_length:].tolist()
        tokens = []
        for step, token in enumerate(generated):
            logprobs = torch.log_softmax(out.logits[step][0].float(), dim=-1)
            top = torch.topk(logprobs, top_k) if top_k > 0 else None
            tokens.append({
                "id": token,
                "token": self.tokenizer.decode([token]),
                "logprob": float(logprobs[token]),
                "top": [] if top is None else [{"token": self.tokenizer.decode([int(t)]), "logprob": float(v)} for v, t in zip(top.values, top.indices)],
            })

        eos = self.hf.generation_config.eos_token_id
        eos_ids = set(eos if isinstance(eos, list) else [eos])
        if cancel.is_set():
            finish = "cancelled"
        elif generated and generated[-1] in eos_ids:
            finish = "stop"
        else:
            finish = "length"

        reasoning, output = split_reasoning(tokens, self.think_ids(), lambda ids: self.tokenizer.decode(ids, skip_special_tokens=True))
        capture = None
        if not cancel.is_set():
            capture = self.capture(sequence, plan, prompt_length, Path(params["tensorsDir"]) / "residual.safetensors")
            capture["file"] = "tensors/residual.safetensors"
            capture["tokens"] = [self.tokenizer.decode([t]) for t in sequence[0, capture["positions"]].tolist()]
        gauge.sample()
        return {
            "reasoning": reasoning,
            "output": output,
            "finish": finish,
            "usage": {"inputTokens": prompt_length, "outputTokens": len(generated)},
            "generation": {**generation, "seed": seed, "chatTemplate": self.spec.template_args},
            "capture": capture,
            "runtime": {
                "device": self.device,
                "dtype": "float32",
                "quantization": "none",
                "cache": generation["use_cache"],
                "seed": seed,
                "revision": self.revision,
                "libraries": libraries(),
                "peakMemoryBytes": gauge.peak,
                "captureMethod": CAPTURE_METHOD,
            },
        }

