import { test } from "vitest";

/**
 * Declares a test for a bug listed in docs/PLAN.md that is not fixed yet.
 *
 * The test body asserts the correct behaviour. Vitest's `test.fails` reports
 * it as passing while the assertion fails, and as failing once the bug is
 * fixed, so the fix has to switch it to a plain `test`. Setting
 * RT_EXPECT_FIXED=1 runs every known-bug test as a plain test; that is how the
 * phase 0 gate shows each one really fails today.
 */
export const knownBug = process.env.RT_EXPECT_FIXED === "1" ? test : test.fails;
