from math import comb

import pytest

from reasontrace_sidecar.ground_truth.verdict import ALPHA, REQUIRED, chance_bound, verdict


def tail(n, p, k):
    return sum(comb(n, i) * p**i * (1 - p) ** (n - i) for i in range(k, n + 1))


class TestChanceBound:
    def test_is_the_smallest_count_rarer_than_alpha(self):
        n, p = 64, 1 / 64
        k = round(chance_bound(n, p, tests=1) * n)
        assert tail(n, p, k) <= ALPHA < tail(n, p, k - 1)

    def test_rises_with_the_number_of_scores_compared(self):
        assert chance_bound(64, 1 / 64, tests=9) > chance_bound(64, 1 / 64, tests=1)


class TestVerdict:
    def test_validated_when_the_decoder_recovers_and_every_control_fails(self):
        assert verdict(1.0, {"random direction": 0.02, "untrained weights": 0.0}, 0.1) == ("validated", None)

    def test_a_control_that_also_succeeds_marks_it_unvalidated(self):
        status, reason = verdict(1.0, {"random direction": 0.02, "untrained weights": 1.0}, 0.1)
        assert status == "unvalidated"
        assert "untrained weights (100%)" in reason
        assert "random direction" not in reason

    @pytest.mark.parametrize("score", [0.0, REQUIRED - 0.01])
    def test_failing_to_recover_the_variable_marks_it_unvalidated(self, score):
        status, reason = verdict(score, {"random direction": 0.0}, 0.1)
        assert status == "unvalidated"
        assert "short of" in reason
