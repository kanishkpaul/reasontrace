# Fixtures

Provider responses replayed by the tests through `test/fixtureFetch.ts`. Each
file's `recorded` field says where it came from.

- `llamacpp-*`: recorded from a llama.cpp server running Qwen3 0.6B. To record
  again, start `llama-server -hf Qwen/Qwen3-0.6B-GGUF:Q8_0 --jinja --port 8080`
  and save the raw response body of the request in each file's `request`.
  `llamacpp-401` came from a server started with a dummy `--api-key` and sent
  another.
- `openai-*`: written by hand in the documented shape, for replies a local
  server can't produce (refusals, a refused probabilities request, a key echoed
  in an error, an error sent mid-stream). Replace one with a recording when a
  key is available, and scrub the key before committing.
