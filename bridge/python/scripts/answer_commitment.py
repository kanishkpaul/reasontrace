"""Runs the answer-commitment finding on Qwen3 0.6B and stores it under fixtures/findings.

Usage: uv run --extra model python scripts/answer_commitment.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from reasontrace_sidecar.decoders import runner  # noqa: E402
from reasontrace_sidecar.findings import commitment, study  # noqa: E402
from reasontrace_sidecar.runtime import CAPTURE_METHOD, DTYPE, Host, libraries  # noqa: E402

MODEL = "qwen3-0.6b"
MAX_TOKENS = 2048
OUT = Path(__file__).resolve().parents[3] / "fixtures" / "findings" / "answer-commitment-qwen3-0.6b.json"


def main() -> None:
    host = Host()
    host.load(MODEL)
    readouts = study.Readouts(host)
    problems = []
    for i, (a, b, c) in enumerate(commitment.PROBLEMS):
        record = study.run_problem(readouts, a, b, c, MAX_TOKENS)
        problems.append(record)
        print(f"{i + 1}/{len(commitment.PROBLEMS)} {record['prompt']} -> {record['answer']} ({record['excluded'] or f'{len(record['steps'])} steps'})", flush=True)
    finding = {
        "kind": study.KIND,
        "title": f"When does {host.spec.name} commit to its answer?",
        "model": {"id": MODEL, "name": host.spec.name, "repo": host.spec.repo, "revision": host.revision},
        "runtime": {"device": host.device, "dtype": str(DTYPE).removeprefix("torch."), "seed": study.SEED, "maxTokens": MAX_TOKENS, "greedy": True, "libraries": libraries(), "captureMethod": CAPTURE_METHOD},
        "layers": len(host.layers()),
        "rules": {"internal": commitment.INTERNAL_RULE, "stated": commitment.STATED_RULE},
        "lens": {"name": "logit lens", "version": "1", "validation": runner.lens_validation()},
        "problems": problems,
        "summary": commitment.summarise(problems),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(finding, ensure_ascii=False) + "\n")
    print(json.dumps(finding["summary"], indent=1))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
