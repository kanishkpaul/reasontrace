import json
from pathlib import Path

import pytest

from reasontrace_sidecar.findings import commitment
from reasontrace_sidecar.steps import sentences, token_ends

STORED = Path(__file__).resolve().parents[3] / "fixtures" / "findings" / "answer-commitment-qwen3-0.6b.json"


def split(text):
    return [text[a:b] for a, b in sentences(text)]


class TestSentences:
    def test_sentence_ends_and_line_breaks_split_steps(self):
        assert split("So 17 + 34 is 51. Then 51 - 51 = 0!\nIs that right?") == ["So 17 + 34 is 51.", "Then 51 - 51 = 0!", "Is that right?"]

    def test_decimals_and_list_numbers_do_not(self):
        assert split("Is 9.11 bigger than 9.9?\n1. Compare tenths.\n2. Done") == ["Is 9.11 bigger than 9.9?", "1. Compare tenths.", "2. Done"]

    def test_closing_quotes_stay_with_their_sentence(self):
        assert split('He said "yes." Then left.') == ['He said "yes."', "Then left."]

    def test_blank_text_has_no_steps(self):
        assert split("  \n\n ") == []

    def test_each_step_ends_on_the_token_that_reaches_its_last_character(self):
        # Tokens: "So", " 51.", " Then", " 0."
        offsets = [2, 6, 11, 14]
        assert token_ends(offsets, sentences("So 51. Then 0.")) == [1, 3]


class TestRules:
    @pytest.mark.parametrize("output, answer", [
        ("$$\\boxed{0}$$", 0),
        ("43 + 24 = 67\n67 - 66 = 1\n\nAnswer: 1", 1),
        ("The answer is 12.", None),
        ("It is 0.5", None),
        ("no number", None),
    ])
    def test_the_answer_is_the_last_number_and_must_be_one_digit(self, output, answer):
        assert commitment.answer_of(output) == answer

    def test_a_step_states_the_answer_only_as_a_number_on_its_own(self):
        assert commitment.states("So the answer is 1.", 1)
        assert not commitment.states("17 + 34 is 51.", 1)
        assert not commitment.states("about 1.5", 1)

    def test_decodable_needs_most_of_the_second_half(self):
        assert commitment.decodable([9, 9, 3, 3, 3, 9], 3)
        assert not commitment.decodable([3, 3, 3, 3, 9, 9], 3)

    def test_internal_commitment_is_where_the_answer_stays(self):
        assert commitment.internal_commitment([False, True, False, True, True]) == 3
        assert commitment.internal_commitment([True, True, False]) is None

    def test_shuffled_answers_always_differ(self):
        answers = [1, 1, 2, 3, 3]
        assert all(a != b for a, b in zip(answers, commitment.shuffled(answers)))

    def test_the_problem_set_is_balanced_and_never_gives_the_answer_away(self):
        answers = [a + b - c for a, b, c in commitment.PROBLEMS]
        assert sorted(answers) == sorted(list(range(10)) * 2)
        for (a, b, c), d in zip(commitment.PROBLEMS, answers):
            assert str(d) not in f"{a}{b}{c}{a + b}"


def test_the_stored_summary_follows_from_the_stored_problems():
    finding = json.loads(STORED.read_text())
    assert commitment.summarise(finding["problems"]) == finding["summary"]
    for problem in finding["problems"]:
        readouts = problem["steps"] + [problem["answerStep"]]
        assert [r["decodable"] for r in readouts] == [commitment.decodable(r["top"], problem["answer"]) for r in readouts]
        assert problem["internalCommitment"] == commitment.internal_commitment([r["decodable"] for r in readouts])
        assert problem["statedCommitment"] == commitment.stated_commitment([s["text"] for s in problem["steps"]], problem["answer"])
