import { asciiBar } from "../lib/ascii";

/** A probability drawn in block characters. The number beside it is what screen readers get. */
export function AsciiBar({ fraction }: { fraction: number }) {
  return <span className="ascii-bar" aria-hidden="true">{asciiBar(fraction)}</span>;
}
