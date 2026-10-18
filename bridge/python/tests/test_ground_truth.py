"""Gate: on the planted circuit, the logit lens recovers the planted variable and each control fails to.

Skipped where the model runtime is missing. Needs no downloaded weights: the
planted model is built in memory.
"""

import json
from pathlib import Path

import pytest

torch = pytest.importorskip("torch")
from reasontrace_sidecar.ground_truth import harness, planted  # noqa: E402

STORED = Path(__file__).resolve().parents[3] / "fixtures" / "validation" / "lens.logit-1.json"


@pytest.fixture(scope="module")
def model():
    return planted.planted_model()


@pytest.fixture(scope="module")
def result(model):
    return harness.validate(model, planted.task())


def test_the_planted_model_computes_its_variable(model):
    task = planted.task()
    with torch.no_grad():
        answers = model(task.prompts).logits[:, -1].argmax(dim=-1)
    assert torch.equal(answers, task.labels)


def test_the_lens_recovers_the_variable_where_it_enters_the_unembedding_basis(result):
    assert result["byLayer"][: planted.READABLE_FROM] == [0.0] * planted.READABLE_FROM
    assert all(score == 1.0 for score in result["byLayer"][planted.READABLE_FROM :])
    assert result["recoveredFrom"] == planted.READABLE_FROM


def test_every_control_fails_and_the_lens_is_validated(result):
    assert [c["succeeded"] for c in result["controls"]] == [False, False, False]
    assert all(c["score"] < result["chanceBound"] for c in result["controls"])
    assert (result["status"], result["reason"]) == ("validated", None)


def test_a_control_that_succeeds_marks_the_lens_unvalidated(model):
    # The input token itself sits in the unembedding basis of any tied model,
    # trained or not, so the untrained-weights control decodes it as well.
    result = harness.validate(model, planted.task(variable=lambda x: x))
    untrained = next(c for c in result["controls"] if c["control"] == "untrained weights")
    assert result["score"] == 1.0
    assert untrained["succeeded"]
    assert result["status"] == "unvalidated"
    assert "untrained weights" in result["reason"]


def test_the_stored_validation_is_what_the_harness_gives(result):
    assert json.loads(STORED.read_text()) == result
