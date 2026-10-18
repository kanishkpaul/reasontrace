"""JSON-RPC 2.0 over stdio, one JSON object per line.

Stdout carries only protocol messages, so everything else (warnings, progress
bars, logs) must go to stderr.
"""

import json
import sys
import threading
from typing import Any, TextIO


class RpcError(Exception):
    """An error the caller should see as a JSON-RPC error with this code and message."""

    def __init__(self, code: int, message: str):
        super().__init__(message)
        self.code = code


INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603
UNAVAILABLE = -32000


class Channel:
    """Writes responses and notifications; safe to call from several threads."""

    def __init__(self, out: TextIO = sys.stdout):
        self._out = out
        self._lock = threading.Lock()

    def _write(self, message: dict[str, Any]) -> None:
        line = json.dumps(message, ensure_ascii=False, allow_nan=False)
        with self._lock:
            self._out.write(line + "\n")
            self._out.flush()

    def result(self, request_id: Any, result: Any) -> None:
        self._write({"jsonrpc": "2.0", "id": request_id, "result": result})

    def error(self, request_id: Any, code: int, message: str) -> None:
        self._write({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})

    def notify(self, method: str, params: dict[str, Any]) -> None:
        self._write({"jsonrpc": "2.0", "method": method, "params": params})


def parse(line: str) -> tuple[Any, str, dict[str, Any]]:
    """The id, method and params of one request line.

    Raises RpcError (INVALID_REQUEST) for a line that is not a JSON-RPC request.
    """
    try:
        message = json.loads(line)
    except json.JSONDecodeError as e:
        raise RpcError(INVALID_REQUEST, f"Not JSON: {e}") from e
    if not isinstance(message, dict) or not isinstance(message.get("method"), str):
        raise RpcError(INVALID_REQUEST, "A request needs a string `method`.")
    params = message.get("params", {})
    if not isinstance(params, dict):
        raise RpcError(INVALID_REQUEST, "`params` must be an object.")
    return message.get("id"), message["method"], params
