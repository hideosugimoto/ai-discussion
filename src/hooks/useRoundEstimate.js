import { useEffect, useRef, useState } from "react";

// Adaptive "remaining rounds" estimate. The app refetches usage after each round,
// so the increase in used_usd between fetches ≈ that round's real cost. We keep a
// per-mode exponential moving average of that cost (persisted), so the estimate
// converges on how THIS user actually plays — heavy rounds, search, long history,
// even 20-round discussions — instead of a fixed assumption. Remaining budget /
// avg-cost-per-round gives a round count that stays honest as usage varies.

const KEY = "round-cost-ema-v1";
// USD per round, measured defaults used until the user generates their own data.
const SEED = { fast: 0.04, best: 0.14 };
const ALPHA = 0.3;            // EMA weight on the newest round
const MIN_ROUND = 0.01;       // below this, treat as a no-op fetch, not a round
const MAX_ROUND = 2.0;        // above this, treat as a batched/abnormal jump

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw.fast === "number" && typeof raw.best === "number") return raw;
  } catch { /* ignore */ }
  return { ...SEED };
}

export default function useRoundEstimate(usage, mode) {
  const [ema, setEma] = useState(load);
  const prevUsedRef = useRef(null);

  useEffect(() => {
    const used = usage?.used_usd;
    if (typeof used !== "number") return;
    const prev = prevUsedRef.current;
    prevUsedRef.current = used;
    if (prev == null) return;            // first sample: establish baseline only
    const delta = used - prev;
    if (delta < MIN_ROUND || delta > MAX_ROUND) return; // not a single plausible round
    const key = mode === "best" ? "best" : "fast";
    setEma((cur) => {
      const next = { ...cur, [key]: cur[key] * (1 - ALPHA) + delta * ALPHA };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [usage?.used_usd, mode]);

  const remaining = Math.max(0, usage?.remaining_usd ?? 0);
  const rounds = (perRound) => Math.max(0, Math.floor(remaining / Math.max(0.001, perRound)));
  return { fastRounds: rounds(ema.fast), bestRounds: rounds(ema.best) };
}
