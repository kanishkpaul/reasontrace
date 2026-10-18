# Fixtures

Anthropic responses replayed by the tests through `test/fixtureFetch.ts`. Each
file's `recorded` field says where it came from.

- `llamacpp-messages-*`: recorded from a llama.cpp server running Qwen3 0.6B,
  standing in for Anthropic through its Messages endpoint and started with a
  dummy `--api-key` (docs/PLAN.md D-6). They show that our side of the API
  works against a second implementation of it, not that Anthropic replies
  this way. To record again, start
  `llama-server -hf Qwen/Qwen3-0.6B-GGUF:Q8_0 --jinja --api-key <dummy>` and
  send each file's `request`, or `GET` its `path`, with the key in `x-api-key`.
- `anthropic-*`: written by hand in the shape the Anthropic streaming,
  thinking, refusal and error docs give, for replies only Anthropic sends:
  signed and redacted thinking, refusals with stop details, an error event
  mid-stream, its own error bodies. `npm run test:live` with a key in the
  keychain checks the shape against the real API.
