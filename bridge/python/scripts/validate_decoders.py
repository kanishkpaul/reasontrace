"""Writes the stored validation of the logit lens on the planted circuit.

Decoder attachments carry this result as their `validation`. The test
tests/test_ground_truth.py runs the harness again and fails if the result
differs from the stored one.

Usage: uv run --extra model python scripts/validate_decoders.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from reasontrace_sidecar.ground_truth import harness, planted  # noqa: E402

OUT = Path(__file__).resolve().parents[3] / "fixtures" / "validation" / "lens.logit-1.json"


def main() -> None:
    result = harness.validate(planted.planted_model(), planted.task())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT}: {result['status']}")


if __name__ == "__main__":
    main()
