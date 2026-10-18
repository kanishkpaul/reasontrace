import { describe, expect, test } from "vitest";
import { extractFormula, readTranslation } from "./translation.ts";

const TEXT = "Ann is 30. Ben is more than 5 years older than Ann. Ben is younger than 34.";

const formula = (...lines: string[]) => ["(declare-const ann Int)", "(declare-const ben Int)", ...lines].join("\n");

describe("pulling the formula out of a reply", () => {
  test("the last code block with an assertion wins", () => {
    expect(extractFormula("Plan:\n```text\nnot this\n```\n```smt2\n(assert p)\n```\nDone.")).toBe("(assert p)");
  });

  test("a code block with no assertion is still the formula, for the engine to refuse", () => {
    expect(extractFormula("```smt2\ndeclare (Ann 30)\nassert (Ben > 30)\n```")).toBe("declare (Ann 30)\nassert (Ben > 30)");
  });

  test("a reply with no code block is read from its first declaration", () => {
    expect(extractFormula("Here it is: (declare-const p Bool) (assert p)")).toBe("(declare-const p Bool) (assert p)");
  });

  test("a reply with no SMT-LIB gives nothing", () => {
    expect(extractFormula("I cannot do that.")).toBeNull();
  });
});

describe("lining a formula up against its problem", () => {
  test("a faithful translation has no departures, and each assertion finds its words", () => {
    const read = readTranslation(TEXT, formula(
      '; "Ann is 30"', "(assert (= ann 30))",
      '; "Ben is more than 5 years older than Ann"', "(assert (> ben (+ ann 5)))",
      '; "Ben is younger than 34"', "(assert (< ben 34))",
    ));
    expect(read.assertions.map((a) => a.departures)).toEqual([[], [], []]);
    expect(read.assertions.map((a) => a.span && TEXT.slice(...a.span))).toEqual(["Ann is 30", "Ben is more than 5 years older than Ann", "Ben is younger than 34"]);
    expect(read.unencoded).toEqual([]);
  });

  test("a changed number is flagged on its assertion", () => {
    const read = readTranslation(TEXT, formula('; "Ben is younger than 34"', "(assert (< ben 43))"));
    expect(read.assertions[0].departures).toEqual([{ check: "numbers", detail: "The words give 34; the assertion has 43." }]);
  });

  test("a flipped comparison is flagged, and a mirrored or negated one is not", () => {
    const flipped = readTranslation(TEXT, formula('; "Ben is younger than 34"', "(assert (> ben 34))"));
    expect(flipped.assertions[0].departures).toEqual([{ check: "relation", detail: 'The words say "younger than" (<); the assertion compares with >.' }]);
    const mirrored = readTranslation(TEXT, formula('; "Ben is younger than 34"', "(assert (> 34 ben))"));
    const negated = readTranslation(TEXT, formula('; "Ben is younger than 34"', "(assert (not (>= ben 34)))"));
    expect([mirrored.assertions[0].departures, negated.assertions[0].departures]).toEqual([[], []]);
  });

  test("words the problem does not contain, and an assertion with no comment, are flagged", () => {
    const read = readTranslation(TEXT, formula('; "Ben is 40"', "(assert (= ben 40))", "(assert (> ann 0))"));
    expect(read.assertions.map((a) => a.departures[0].detail)).toEqual([
      '"Ben is 40" is not in the problem.',
      "No comment says which words of the problem this assertion encodes.",
    ]);
  });

  test("a sentence no assertion quotes is listed as not encoded", () => {
    const read = readTranslation(TEXT, formula('; "Ann is 30"', "(assert (= ann 30))"));
    expect(read.unencoded.map((u) => u.text)).toEqual(["Ben is more than 5 years older than Ann.", "Ben is younger than 34."]);
  });

  test("quotes match across case, spacing and closing punctuation; numbers can be words", () => {
    const read = readTranslation("Cara owns at  least Three cats.", '; "cara owns at least three cats."\n(assert (>= cats 3))');
    expect(read.assertions[0].departures).toEqual([]);
    expect(read.assertions[0].span).toEqual([0, 30]);
  });

  test("comments inside an assertion, strings and quoted symbols do not split it", () => {
    const read = readTranslation("x is above 2", '; "x is above 2"\n(assert ; inside\n  (> |x y| 2))\n(check-sat)');
    expect(read.assertions).toHaveLength(1);
    expect(read.assertions[0].formula).toBe("(assert ; inside\n  (> |x y| 2))");
    expect(read.assertions[0].departures).toEqual([]);
  });
});
