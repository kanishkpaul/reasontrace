"""A model with a planted circuit, whose every weight is written by hand.

It is a four-layer Qwen3, the architecture of the real models, so decoders run
through the same modules. The input is the last token x. Layer 1's MLP writes a
code for x into dimensions the unembedding never reads; layer 2's MLP reads that
code and writes σ(x) in the unembedding's basis, where σ is a permutation with
no fixed points. Attention is zeroed, so earlier tokens have no effect and the
model's answer is σ(x).

So the planted variable σ(x) is held from layer 1, but a decoder reading through
the unembedding can only find it from layer 2. Before that, the stream reads as
x itself.
"""

from dataclasses import dataclass

import torch
from transformers import Qwen3Config, Qwen3ForCausalLM

VOCAB = 64
#: The token basis, then the private basis that layer 1 writes to.
WIDTH = 2 * VOCAB
LAYERS = 4
#: Where σ(x) is first held, and where it first lies in the unembedding's basis.
HELD_FROM = 1
READABLE_FROM = 2
PREFIX = 3

DESCRIPTION = (
    f"A {LAYERS}-layer Qwen3-architecture model with hand-written weights and a {VOCAB}-token vocabulary. "
    f"It answers σ(x) = (7x + 3) mod {VOCAB} for the last token x. Layer {HELD_FROM} writes x into dimensions "
    f"the unembedding never reads; layer {READABLE_FROM} writes σ(x) into the unembedding's basis."
)


def sigma(x: torch.Tensor) -> torch.Tensor:
    """A permutation of the vocabulary with no fixed points: 6x ≡ −3 (mod 64) has no solution."""
    return (7 * x + 3) % VOCAB


def config() -> Qwen3Config:
    return Qwen3Config(
        vocab_size=VOCAB,
        hidden_size=WIDTH,
        intermediate_size=VOCAB,
        num_hidden_layers=LAYERS,
        num_attention_heads=2,
        num_key_value_heads=1,
        head_dim=WIDTH // 2,
        tie_word_embeddings=True,
        max_position_embeddings=PREFIX + 1,
    )


def planted_model() -> Qwen3ForCausalLM:
    model = Qwen3ForCausalLM(config()).eval()
    tokens = torch.arange(VOCAB)
    with torch.no_grad():
        for name, parameter in model.named_parameters():
            # Norm weights stay at one; everything else starts at zero, which zeroes attention.
            parameter.copy_(torch.ones_like(parameter) if name.endswith("norm.weight") else torch.zeros_like(parameter))
        # Token t is the basis vector e_t, and the tied unembedding reads e_t back as t.
        model.model.embed_tokens.weight[tokens, tokens] = 1.0

        # Each MLP neuron j fires only on its own input direction, since its gate
        # and up rows are that direction and the directions are orthogonal.
        write = model.model.layers[HELD_FROM].mlp
        write.gate_proj.weight[tokens, tokens] = 1.0
        write.up_proj.weight[tokens, tokens] = 1.0
        write.down_proj.weight[VOCAB + tokens, tokens] = 0.02

        read = model.model.layers[READABLE_FROM].mlp
        read.gate_proj.weight[tokens, VOCAB + tokens] = 1.0
        read.up_proj.weight[tokens, VOCAB + tokens] = 1.0
        read.down_proj.weight[sigma(tokens), tokens] = 0.05
    return model


@dataclass(frozen=True)
class Task:
    #: [items, PREFIX + 1]; the last token is the input.
    prompts: torch.Tensor
    #: [items]
    labels: torch.Tensor
    description: str


def task(variable=sigma, seed: int = 0) -> Task:
    """One prompt per vocabulary token, each after a random prefix, labelled with `variable` of that token."""
    generator = torch.Generator().manual_seed(seed)
    inputs = torch.arange(VOCAB)
    prefix = torch.randint(0, VOCAB, (VOCAB, PREFIX), generator=generator)
    return Task(torch.cat([prefix, inputs[:, None]], dim=1), variable(inputs), DESCRIPTION)
