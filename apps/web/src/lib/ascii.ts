const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

/** A fraction from 0 to 1 as a bar `cells` characters wide, filled in eighths of a cell: ███▍········ */
export function asciiBar(fraction: number, cells = 12): string {
  const eighths = Math.round(Math.min(1, Math.max(0, fraction)) * cells * 8);
  const full = Math.floor(eighths / 8);
  const part = EIGHTHS[eighths % 8];
  return "█".repeat(full) + part + "·".repeat(cells - full - (part ? 1 : 0));
}
