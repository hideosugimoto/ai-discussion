// Compact per-round timeline of how agreement vs conflict evolved, so the user
// can see at a glance whether the discussion is converging or still split.
// `summaries` is the array of per-round summary objects (some may be null).
function count(arr) { return Array.isArray(arr) ? arr.length : 0; }

export default function RoundTimeline({ summaries }) {
  const rounds = (summaries || []).map((s, i) => ({
    round: i + 1,
    agree: s ? count(s.agreements) : 0,
    conflict: s ? count(s.disagreements) : 0,
    ready: !!s,
  }));
  if (rounds.length < 2) return null; // a timeline needs at least 2 points

  return (
    <div style={{ display:"flex", alignItems:"stretch", gap:6, overflowX:"auto", paddingBottom:2 }}>
      {rounds.map((r, idx) => (
        <div key={r.round} style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
          <div title={`Round ${r.round}: 合意${r.agree} / 対立${r.conflict}`}
            style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, padding:"4px 8px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, minWidth:54 }}>
            <span style={{ fontSize:9, color:"var(--text3)", fontFamily:"monospace" }}>R{r.round}</span>
            <span style={{ fontSize:11, color:"var(--success)", fontWeight:700 }}>🤝{r.agree}</span>
            <span style={{ fontSize:11, color:"var(--error)", fontWeight:700 }}>⚔️{r.conflict}</span>
          </div>
          {idx < rounds.length - 1 && (
            <span style={{ color:"var(--text3)", fontSize:12 }}>→</span>
          )}
        </div>
      ))}
    </div>
  );
}
