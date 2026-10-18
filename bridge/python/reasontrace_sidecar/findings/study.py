"""Runs the answer-commitment finding on a model: generates each problem, splits the reasoning into steps, and reads the digits through the logit lens at each step's end."""

import tempfile
import threading
from typing import Any

import torch
from nnsight import NNsight

from ..decoders import logit_lens
from ..ground_truth import controls
from ..plan import read_plan
from ..runtime import Host, residual
from ..steps import sentences, token_ends
from . import commitment

KIND = "finding.answer_commitment/1"
SEED = 0


class Readouts:
    """The digits read through the lens at chosen positions: by the model, a random unembedding, and an untrained copy."""

    def __init__(self, host: Host):
        self.host = host
        self.digits = [host.tokenizer.convert_tokens_to_ids(d) for d in commitment.DIGITS]
        self.layers = range(len(host.layers()))
        self.via = logit_lens.readout(host.hf)
        self.random_via = controls.random_direction(self.via, SEED)
        untrained = controls.untrained_weights(host.hf, SEED).to(host.device)
        self.untrained = NNsight(untrained)
        self.untrained_via = logit_lens.readout(untrained)

    def digits_at(self, hidden: dict[int, torch.Tensor], positions: list[int], via: logit_lens.Readout) -> torch.Tensor:
        """[positions, layers, 10] log-probabilities over the digits alone."""
        unembed = via.unembed[self.digits]
        by_layer = [torch.log_softmax(via.norm(hidden[i][0, positions]) @ unembed.T, dim=-1) for i in self.layers]
        return torch.stack(by_layer, dim=1).float().cpu()

    def read(self, ids: torch.Tensor, positions: list[int]) -> dict[str, torch.Tensor]:
        with torch.no_grad():
            own = residual(self.host.lm, ids, self.layers)
            untrained = residual(self.untrained, ids, self.layers)
            return {
                "own": self.digits_at(own, positions, self.via),
                "random": self.digits_at(own, positions, self.random_via),
                "untrained": self.digits_at(untrained, positions, self.untrained_via),
            }


def step_record(text: str, position: int, read: dict[str, torch.Tensor], i: int, answer: int) -> dict[str, Any]:
    own = read["own"][i]
    return {
        "text": text,
        "position": position,
        "top": own.argmax(dim=-1).tolist(),
        # Probability of the model's answer among the ten digits, by layer.
        "p": [round(v, 4) for v in own[:, answer].exp().tolist()],
        "decodable": commitment.decodable(own.argmax(dim=-1).tolist(), answer),
        "randomTop": read["random"][i].argmax(dim=-1).tolist(),
        "untrainedTop": read["untrained"][i].argmax(dim=-1).tolist(),
    }


def run_problem(readouts: Readouts, a: int, b: int, c: int, max_tokens: int) -> dict[str, Any]:
    host = readouts.host
    prompt = commitment.PROMPT.format(a=a, b=b, c=c)
    with tempfile.TemporaryDirectory() as tensors:
        result = host.run(
            {"model": host.spec.id, "prompt": prompt, "maxTokens": max_tokens, "topLogprobs": 0, "seed": SEED, "tensorsDir": tensors, "plan": {"layers": [0], "positions": "last"}},
            read_plan, lambda channel, text: None, threading.Event(),
        )
    record: dict[str, Any] = {"prompt": prompt, "correct": a + b - c, "output": result["output"]["text"], "finish": result["finish"], "answer": None, "excluded": None, "steps": [], "answerStep": None, "internalCommitment": None, "statedCommitment": None}
    reasoning = result["reasoning"]
    if reasoning is None or not reasoning["closed"]:
        record["excluded"] = f"The reasoning did not finish within {max_tokens} tokens."
        return record
    answer = commitment.answer_of(result["output"]["text"])
    if answer is None:
        record["excluded"] = "The answer was not a single digit."
        return record
    record["answer"] = answer

    # Between <think> and </think>; offsets come from decoding each prefix, so multi-byte characters land where they do in the text.
    inner = [t["id"] for t in reasoning["tokens"][1:-1]]
    offsets = [len(host.tokenizer.decode(inner[: i + 1], skip_special_tokens=True)) for i in range(len(inner))]
    text = host.tokenizer.decode(inner, skip_special_tokens=True)
    spans = sentences(text)
    prompt_ids = host.prompt_ids(prompt)
    start = prompt_ids.shape[1] + 1
    generated = [t["id"] for t in reasoning["tokens"]] + [t["id"] for t in result["output"]["tokens"]]
    ids = torch.cat([prompt_ids, torch.tensor([generated], device=prompt_ids.device)], dim=1)
    output_index = max(i for i, t in enumerate(result["output"]["tokens"]) if t["token"].strip() == str(answer))
    answer_position = prompt_ids.shape[1] + len(reasoning["tokens"]) + output_index - 1

    positions = [start + end for end in token_ends(offsets, spans)] + [answer_position]
    read = readouts.read(ids, positions)
    record["steps"] = [step_record(text[s:e], p, read, i, answer) for i, ((s, e), p) in enumerate(zip(spans, positions))]
    record["answerStep"] = step_record("", answer_position, read, len(spans), answer)
    del record["answerStep"]["text"]
    record["internalCommitment"] = commitment.internal_commitment([step["decodable"] for step in record["steps"]] + [record["answerStep"]["decodable"]])
    record["statedCommitment"] = commitment.stated_commitment([step["text"] for step in record["steps"]], answer)
    return record
