# Fixtures

Anthropic responses replayed by the tests through `test/fixtureFetch.ts`. All
are written by hand in the shape the Anthropic streaming, thinking and refusal
docs give; each file's `recorded` field says so. `npm run test:live` with a key
in the keychain checks the shape against the real API. Replace a fixture with
a recording when a key is available, and scrub the key before committing.
