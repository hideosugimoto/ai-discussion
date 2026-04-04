import MessageBubble from "./MessageBubble";

export default function RoundSection({ round, roundNum, isLatest, personas }) {
  return (
    <div className="round-section" style={{ marginBottom:"var(--ui-gap-lg)" }}>
      <div className="round-header" style={{ display:"flex", alignItems:"center", gap:"var(--ui-gap)", marginBottom:"var(--ui-gap)" }}>
        <div style={{ fontFamily:"monospace", fontSize:11, letterSpacing:"0.2em", color:"var(--text3)", textTransform:"uppercase" }}>Round {roundNum}</div>
        <div className="round-divider" style={{ flex:1, height:1, background:"var(--border)" }} />
        {round.userIntervention && (
          <div style={{ fontSize:11, color:"var(--accent-light)", fontStyle:"italic" }}>💬 {round.userIntervention}</div>
        )}
      </div>
      <div className="round-messages">
        {round.messages.map((msg) => <MessageBubble key={msg.modelId} msg={msg} isNew={isLatest} persona={personas?.[msg.modelId]} />)}
      </div>
    </div>
  );
}
