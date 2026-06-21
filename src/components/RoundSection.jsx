import MessageBubble from "./MessageBubble";

export default function RoundSection({ round, roundNum, isLatest, personas }) {
  return (
    <div className="round-section" style={{ marginBottom:28 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <div style={{ fontFamily:"monospace", fontSize:11, letterSpacing:"0.2em", color:"var(--text3)", textTransform:"uppercase" }}>Round {roundNum}</div>
        <div style={{ flex:1, height:1, background:"var(--border)" }} />
        {round.userIntervention && (
          <div style={{ fontSize:11, color:"var(--accent-light)", fontStyle:"italic" }}>💬 {round.userIntervention}</div>
        )}
      </div>
      <div className="round-messages">
        {round.messages.map((msg) => <MessageBubble key={msg.modelId} msg={msg} isNew={isLatest} persona={personas?.[msg.modelId]} />)}
      </div>
      {Array.isArray(round.searchSources) && round.searchSources.length > 0 && (
        <details style={{ marginTop:10, fontSize:11, color:"var(--text3)" }}>
          <summary style={{ cursor:"pointer", color:"var(--text2)" }}>
            🔎 このラウンドで3AIに渡した出典（{round.searchSources.length}）
          </summary>
          <ol style={{ margin:"8px 0 0", paddingLeft:20, lineHeight:1.6 }}>
            {round.searchSources.map((s, idx) => (
              <li key={idx}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color:"var(--accent-light)" }}>
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
