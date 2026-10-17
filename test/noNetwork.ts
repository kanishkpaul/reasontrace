// Default test runs never touch the network: sources get a fixture `fetch`
// instead. RT_LIVE_TESTS=1 turns this off for the live smoke tests.
if (process.env.RT_LIVE_TESTS !== "1") {
  globalThis.fetch = () => {
    throw new Error("Tests must not touch the network. Pass a replayed fetch (test/fixtureFetch.ts) instead.");
  };
}
