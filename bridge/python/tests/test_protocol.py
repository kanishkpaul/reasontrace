import io
import json
import subprocess
import sys
from pathlib import Path

import pytest

from reasontrace_sidecar import __main__ as sidecar
from reasontrace_sidecar.plan import Plan, position_indices, read_plan
from reasontrace_sidecar.rpc import INVALID_PARAMS, INVALID_REQUEST, Channel, RpcError, parse
from reasontrace_sidecar.think import split_reasoning

ROOT = Path(__file__).resolve().parents[1]


def tok(id_, text):
    return {"id": id_, "token": text, "logprob": -0.1, "top": []}


def decode(ids):
    names = {1: "<think>", 2: "</think>", 10: "add", 11: " them", 12: "\n\n", 13: "4"}
    return "".join(names[i] for i in ids if i not in (1, 2))


class TestRpc:
    def test_parse_reads_a_request(self):
        assert parse('{"jsonrpc":"2.0","id":3,"method":"run","params":{"a":1}}') == (3, "run", {"a": 1})

    @pytest.mark.parametrize("line", ["oops", "[1]", '{"id":1}', '{"method":"x","params":[1]}'])
    def test_parse_refuses_what_is_not_a_request(self, line):
        with pytest.raises(RpcError) as e:
            parse(line)
        assert e.value.code == INVALID_REQUEST

    def test_channel_writes_one_message_per_line(self):
        out = io.StringIO()
        channel = Channel(out)
        channel.result(1, {"ok": True})
        channel.notify("delta", {"text": "a\nb"})
        lines = out.getvalue().splitlines()
        assert [json.loads(l) for l in lines] == [
            {"jsonrpc": "2.0", "id": 1, "result": {"ok": True}},
            {"jsonrpc": "2.0", "method": "delta", "params": {"text": "a\nb"}},
        ]


class TestPlan:
    def test_all_layers_expand_and_listed_layers_are_sorted(self):
        assert read_plan({"layers": "all"}, 3).layers == (0, 1, 2)
        assert read_plan({"layers": [2, 0, 2]}, 3).layers == (0, 2)

    @pytest.mark.parametrize("raw", [{"layers": [3]}, {"layers": []}, {"layers": [True]}, {"positions": "first"}, {"pooling": "max"}, "all"])
    def test_bad_plans_are_refused(self, raw):
        with pytest.raises(RpcError) as e:
            read_plan(raw, 3)
        assert e.value.code == INVALID_PARAMS

    def test_positions(self):
        assert position_indices(Plan((0,), "all", "none"), 2, 5) == [0, 1, 2, 3, 4]
        assert position_indices(Plan((0,), "generated", "none"), 2, 5) == [2, 3, 4]
        assert position_indices(Plan((0,), "last", "none"), 2, 5) == [4]


class TestSplitReasoning:
    def test_think_block_then_answer(self):
        tokens = [tok(1, "<think>"), tok(10, "add"), tok(11, " them"), tok(2, "</think>"), tok(12, "\n\n"), tok(13, "4")]
        reasoning, output = split_reasoning(tokens, (1, 2), decode)
        assert reasoning["text"] == "add them" and reasoning["closed"] is True
        assert [t["id"] for t in reasoning["tokens"]] == [1, 10, 11, 2]
        assert output == {"text": "4", "tokens": tokens[4:]}

    def test_unclosed_block_is_all_reasoning(self):
        reasoning, output = split_reasoning([tok(1, "<think>"), tok(10, "add")], (1, 2), decode)
        assert reasoning["closed"] is False and output["tokens"] == []

    def test_no_think_tag_is_all_answer(self):
        reasoning, output = split_reasoning([tok(13, "4")], (1, 2), decode)
        assert reasoning is None and output["text"] == "4"


class TestProcess:
    def talk(self, *lines):
        done = subprocess.run([sys.executable, "-m", "reasontrace_sidecar"], input="\n".join(lines) + "\n", capture_output=True, text=True, cwd=ROOT, timeout=120)
        return [json.loads(l) for l in done.stdout.splitlines()]

    def test_hello_reports_the_runtime_or_why_it_is_missing(self):
        [reply] = self.talk('{"jsonrpc":"2.0","id":1,"method":"hello"}')
        result = reply["result"]
        assert result["protocol"] == 1
        assert (result["runtime"] is None) != (result["unavailable"] is None)

    def test_errors_come_back_as_errors_and_the_process_carries_on(self):
        replies = self.talk('{"jsonrpc":"2.0","id":1,"method":"nope"}', "garbage", '{"jsonrpc":"2.0","id":2,"method":"run","params":{"model":"qwen3-0.6b"}}', '{"jsonrpc":"2.0","id":3,"method":"hello"}')
        assert [r.get("id") for r in replies] == [1, None, 2, 3]
        assert [r["error"]["code"] for r in replies[:3]] == [-32601, -32600, replies[2]["error"]["code"]]
        assert "result" in replies[3]


def test_a_missing_runtime_is_reported_with_how_to_install_it(monkeypatch):
    # A None entry in sys.modules makes the import fail, as it does without
    # torch; the package attribute goes too, or the import would reuse it.
    import reasontrace_sidecar

    monkeypatch.setitem(sys.modules, "reasontrace_sidecar.runtime", None)
    monkeypatch.delattr(reasontrace_sidecar, "runtime", raising=False)
    runtime, reason = sidecar.load_runtime()
    assert runtime is None
    assert "uv sync --extra model" in reason
