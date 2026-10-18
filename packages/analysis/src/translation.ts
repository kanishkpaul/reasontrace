import type { Departure, TranslationAttachment } from "@reasontrace/format";

type Translation = TranslationAttachment["data"];

/**
 * The instructions a pipeline sends the model with the problem. The comment
 * before each assertion is what lets `readTranslation` line the formula up
 * against the text.
 */
export function translationPrompt(text: string): string {
  return [
    "Translate the problem below into SMT-LIB 2 for the z3 solver.",
    "Declare every constant you use. Before each (assert ...), write a comment that quotes, word for word, the words of the problem it encodes. For example:",
    '; "x is above 2"',
    "(assert (> x 2))",
    "Reply with the SMT-LIB in one ```smt2 code block and nothing after it.",
    "",
    "Problem:",
    text.trim(),
  ].join("\n");
}

/**
 * The formula in a model's reply: its last fenced code block with an
 * assertion in it, else its last code block, which may not be SMT-LIB at all
 * and is then the engine's to refuse, else the reply from its first
 * declaration or assertion.
 */
export function extractFormula(output: string): string | null {
  const blocks = [...output.matchAll(/```[\w-]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const block = blocks.filter((b) => b.includes("(assert")).at(-1) ?? blocks.at(-1);
  if (block !== undefined) return block.trim();
  const start = output.search(/\((declare-|define-|assert\b)/);
  return start === -1 ? null : output.slice(start).trim();
}

interface Token {
  kind: "open" | "close" | "atom" | "comment";
  text: string;
  start: number;
  end: number;
}

function tokenise(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === ";") {
      const end = source.indexOf("\n", i) === -1 ? source.length : source.indexOf("\n", i);
      tokens.push({ kind: "comment", text: source.slice(i + 1, end).trim(), start: i, end });
      i = end;
    } else if (c === "(" || c === ")") {
      tokens.push({ kind: c === "(" ? "open" : "close", text: c, start: i, end: i + 1 });
      i++;
    } else {
      // A string or a |quoted symbol| runs to its closing mark; anything else to the next space, bracket or comment.
      const close = c === '"' ? '"' : c === "|" ? "|" : null;
      let end = i + 1;
      if (close) {
        end = source.indexOf(close, i + 1) + 1 || source.length;
      } else {
        while (end < source.length && !/[\s();]/.test(source[end])) end++;
      }
      tokens.push({ kind: "atom", text: source.slice(i, end), start: i, end });
      i = end;
    }
  }
  return tokens;
}

type Sexp = string | Sexp[];

function parse(tokens: Token[]): Sexp {
  let i = 0;
  const read = (): Sexp => {
    const token = tokens[i++];
    if (token.kind !== "open") return token.text;
    const list: Sexp[] = [];
    while (i < tokens.length && tokens[i].kind !== "close") list.push(read());
    i++;
    return list;
  };
  return read();
}

/** Each top-level `(assert …)` with the comments written between it and the form before. */
function assertions(formula: string): { text: string; body: Sexp; comments: string[] }[] {
  const tokens = tokenise(formula);
  const found: { text: string; body: Sexp; comments: string[] }[] = [];
  let comments: string[] = [];
  let depth = 0;
  let start = 0;
  for (const [i, token] of tokens.entries()) {
    if (token.kind === "comment") {
      if (depth === 0) comments.push(token.text);
    } else if (token.kind === "open") {
      if (depth === 0) start = i;
      depth++;
    } else if (token.kind === "close") {
      depth--;
      if (depth === 0) {
        const form = tokens.slice(start, i + 1).filter((t) => t.kind !== "comment");
        if (form[1]?.text === "assert") {
          found.push({ text: formula.slice(tokens[start].start, token.end), body: parse(form.slice(2, -1)), comments });
        }
        comments = [];
      }
    }
  }
  return found;
}

/** The words a comment says an assertion encodes: the text in its double quotes, or the whole comment. */
function quoteOf(comments: string[]): string | null {
  const comment = comments.filter(Boolean).at(-1);
  if (!comment) return null;
  return /"([^"]+)"/.exec(comment)?.[1] ?? comment;
}

/** Where `quote` is in `text`, ignoring case, runs of spaces and closing punctuation. */
function locate(text: string, quote: string): [number, number] | null {
  const words = quote.trim().replace(/[.,;:!?]+$/, "").split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const match = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "i").exec(text);
  return match ? [match.index, match.index + match[0].length] : null;
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

const canonical = (n: string) => String(Number(n));

function numbersInWords(words: string): string[] {
  const digits = [...words.matchAll(/\d+(?:\.\d+)?/g)].map((m) => canonical(m[0]));
  const named = [...words.toLowerCase().matchAll(/\b[a-z]+\b/g)].map((m) => NUMBER_WORDS.indexOf(m[0])).filter((n) => n >= 0).map(String);
  return [...digits, ...named].sort();
}

function numbersInFormula(body: Sexp): string[] {
  if (typeof body === "string") return /^\d+(\.\d+)?$/.test(body) ? [canonical(body)] : [];
  return body.flatMap(numbersInFormula).sort();
}

type Relation = ">" | "<" | ">=" | "<=";

/** Phrases that name a comparison, the inclusive ones first since "no more than" contains "more than". */
const PHRASES: [Relation, RegExp][] = [
  [">=", /\b(at least|no less than|no fewer than|or more)\b/i],
  ["<=", /\b(at most|no more than|or less|or fewer|up to)\b/i],
  [">", /\b(above|more than|greater than|over|exceeds?|older than|taller than|heavier than|later than|after)\b/i],
  ["<", /\b(below|less than|fewer than|under|younger than|shorter than|lighter than|earlier than|before)\b/i],
];

const MIRROR: Record<Relation, Relation> = { ">": "<", "<": ">", ">=": "<=", "<=": ">=" };
const NEGATE: Record<Relation, Relation> = { ">": "<=", "<": ">=", ">=": "<", "<=": ">" };
const isNumeral = (s: Sexp) => typeof s === "string" && /^\d+(\.\d+)?$/.test(s);

/** The comparisons in an assertion, each read with its symbol on the left and through any `not` around it. */
function comparisons(body: Sexp, negated = false): Relation[] {
  if (typeof body === "string") return [];
  const [head, ...args] = body;
  if (head === "not") return args.flatMap((a) => comparisons(a, !negated));
  if (typeof head === "string" && head in MIRROR && args.length === 2) {
    let relation = head as Relation;
    if (isNumeral(args[0]) && !isNumeral(args[1])) relation = MIRROR[relation];
    return [negated ? NEGATE[relation] : relation, ...args.flatMap((a) => comparisons(a, negated))];
  }
  return body.flatMap((a) => comparisons(a, negated));
}

const list = (items: string[]) => items.join(", ");

function departures(quote: string | null, span: [number, number] | null, body: Sexp): Departure[] {
  if (quote === null) return [{ check: "quote", detail: "No comment says which words of the problem this assertion encodes." }];
  if (span === null) return [{ check: "quote", detail: `"${quote}" is not in the problem.` }];
  const found: Departure[] = [];
  const said = numbersInWords(quote);
  const written = numbersInFormula(body);
  if (list(said) !== list(written)) {
    found.push({ check: "numbers", detail: `The words give ${said.length ? list(said) : "no number"}; the assertion has ${written.length ? list(written) : "none"}.` });
  }
  const phrase = PHRASES.find(([, pattern]) => pattern.test(quote));
  if (phrase) {
    const [relation, pattern] = phrase;
    const compared = comparisons(body);
    if (!compared.includes(relation)) {
      found.push({ check: "relation", detail: `The words say "${pattern.exec(quote)![0]}" (${relation}); the assertion compares with ${compared.length ? list(compared) : "nothing"}.` });
    }
  }
  return found;
}

/** The text's sentences: split after . ! or ? before a space, and at line breaks. */
function sentences(text: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const m of text.matchAll(/[^.!?\n]+(?:[.!?]+(?=\s|$))?/g)) {
    const lead = m[0].length - m[0].trimStart().length;
    const trimmed = m[0].trim();
    if (trimmed) spans.push([m.index + lead, m.index + lead + trimmed.length]);
  }
  return spans;
}

export const TRANSLATION_RULES = [
  "Each assertion's comment quotes words that are in the problem, ignoring case and spacing.",
  "The numbers in the quoted words, as digits or as words up to twelve, are the numbers in the assertion.",
  "Where the quoted words name a comparison (above, at least, younger than…), the assertion makes that comparison, read with the symbol on the left.",
  "Every sentence of the problem is quoted by some assertion.",
];

export const TRANSLATION_LIMITATIONS =
  "The checks read words, not meaning. They do not check which side of a comparison each symbol is on, negation in the words, or units, so a wrong formula can pass. An equivalent rewriting, such as x > 17 for at least 18, is flagged. The quotes are the model's own claim about what each assertion encodes.";

/** Lines a formula up against the problem it was written from and checks where it departs (docs/CHARTER.md §2, `inferred`). */
export function readTranslation(text: string, formula: string): Translation {
  const read = assertions(formula).map(({ text: assertion, body, comments }) => {
    const quote = quoteOf(comments);
    const span = quote === null ? null : locate(text, quote);
    return { formula: assertion, quote, span, departures: departures(quote, span, body) };
  });
  const quoted = read.flatMap((a) => (a.span ? [a.span] : []));
  const unencoded = sentences(text)
    .filter(([start, end]) => !quoted.some(([a, b]) => a < end && b > start))
    .map((span) => ({ span, text: text.slice(...span) }));
  return { text, formula, assertions: read, unencoded, rules: TRANSLATION_RULES, limitations: TRANSLATION_LIMITATIONS };
}
