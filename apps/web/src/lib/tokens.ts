/** Visible stand-ins for tokens that are only whitespace. */
export const shown = (token: string) => token.replace(/\n/g, "↵").replace(/^ +$/, (s) => "·".repeat(s.length)) || "∅";
