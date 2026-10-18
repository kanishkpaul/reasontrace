"""The sidecar's entry point: `python -m reasontrace_sidecar`, speaking JSON-RPC on stdio.

Methods:
- hello: versions and device, or why the model runtime can't load.
- models: the supported models and whether their weights are downloaded.
- run: generates, streaming `delta` notifications, and captures to the plan.
- cancel: stops the run with the given request id.

The process ends when stdin closes.
"""

import concurrent.futures
import sys
import threading
import traceback
from typing import Any

from .plan import read_plan
from .rpc import INTERNAL_ERROR, INVALID_PARAMS, METHOD_NOT_FOUND, UNAVAILABLE, Channel, RpcError, parse

PROTOCOL = 1


def load_runtime() -> tuple[Any, str | None]:
    """The runtime module, or None and the reason it can't be imported."""
    try:
        from . import runtime
    except ImportError as e:
        return None, f"The model runtime is not installed ({e}). Run `uv sync --extra model` in bridge/python."
    return runtime, None


def check_run(params: dict[str, Any]) -> None:
    for name, kind in [("model", str), ("prompt", str), ("maxTokens", int), ("tensorsDir", str)]:
        if not isinstance(params.get(name), kind):
            raise RpcError(INVALID_PARAMS, f"run needs `{name}` ({kind.__name__}).")


def main() -> None:
    channel = Channel(sys.stdout)
    # Libraries print to stdout; only protocol messages may go there.
    sys.stdout = sys.stderr
    runtime, missing = load_runtime()
    host = runtime.Host() if runtime else None
    worker = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    cancels: dict[Any, threading.Event] = {}

    def run(request_id: Any, params: dict[str, Any]) -> None:
        cancel = cancels[request_id]
        send = lambda ch, text: channel.notify("delta", {"id": request_id, "channel": ch, "text": text})
        try:
            channel.result(request_id, host.run(params, read_plan, send, cancel))
        except RpcError as e:
            channel.error(request_id, e.code, str(e))
        except Exception as e:
            traceback.print_exc(file=sys.stderr)
            channel.error(request_id, INTERNAL_ERROR, f"{type(e).__name__}: {e}")
        finally:
            cancels.pop(request_id, None)

    for line in sys.stdin:
        if not line.strip():
            continue
        request_id = None
        try:
            request_id, method, params = parse(line)
            if method == "hello":
                channel.result(request_id, {
                    "protocol": PROTOCOL,
                    "runtime": None if missing else {"device": host.device, "libraries": runtime.libraries()},
                    "unavailable": missing,
                })
            elif method == "models":
                if missing:
                    raise RpcError(UNAVAILABLE, missing)
                channel.result(request_id, [
                    {"id": spec.id, "name": spec.name, "repo": spec.repo, "revision": runtime.cached_revision(spec.repo), "noReasoning": spec.no_reasoning}
                    for spec in runtime.MODELS.values()
                ])
            elif method == "run":
                if missing:
                    raise RpcError(UNAVAILABLE, missing)
                check_run(params)
                cancels[request_id] = threading.Event()
                worker.submit(run, request_id, params)
            elif method == "cancel":
                event = cancels.get(params.get("id"))
                if event:
                    event.set()
                if request_id is not None:
                    channel.result(request_id, event is not None)
            else:
                raise RpcError(METHOD_NOT_FOUND, f"No method {method!r}.")
        except RpcError as e:
            channel.error(request_id, e.code, str(e))
    for event in cancels.values():
        event.set()
    worker.shutdown(wait=True)


if __name__ == "__main__":
    main()
