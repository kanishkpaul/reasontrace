import type { TokenLogprob } from "@reasontrace/format";
import { useState } from "react";
import { shown } from "../lib/tokens";
import { EvidenceLabel } from "./EvidenceLabel";

/**
 * Five fill steps, strongest for the least likely tokens, so the places the
 * model hesitated stand out (design/README.md, Token view).
 */
function bin(logprob: number): number {
  const p = Math.exp(logprob);
  if (p >= 0.95) return 0;
  if (p >= 0.8) return 1;
  if (p >= 0.5) return 2;
  if (p >= 0.2) return 3;
  return 4;
}

const percent = (logprob: number) => `${(Math.exp(logprob) * 100).toFixed(1)}%`;

/** The generated tokens with their probabilities, and the alternatives for the one selected. */
export function TokenView({ tokens }: { tokens: TokenLogprob[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const token = selected === null ? null : tokens[selected];
  return (
    <section className="token-view">
      <h3 className="section-heading">Token probabilities</h3>
      <EvidenceLabel label="measured" />
      <p className="hint">Stronger fill, lower probability. Select a token for the alternatives the source returned.</p>
      <p className="token-view__text">
        {tokens.map((t, i) => (
          <button key={i} type="button" className="token" data-bin={bin(t.logprob)} aria-pressed={i === selected} aria-label={`${shown(t.token)}, ${percent(t.logprob)}`} title={percent(t.logprob)} onClick={() => setSelected(i === selected ? null : i)}>
            {shown(t.token)}
          </button>
        ))}
      </p>
      {token && (
        <dl className="token-view__alternatives">
          {(token.top.length ? token.top : [{ token: token.token, logprob: token.logprob }]).map((alt, i) => (
            <div key={i} className="prob-bar" data-chosen={alt.token === token.token || undefined}>
              <dt>{shown(alt.token)}</dt>
              <dd>
                <span className="prob-bar__track"><span className="prob-bar__fill" style={{ width: percent(alt.logprob) }} /></span>
                {percent(alt.logprob)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
