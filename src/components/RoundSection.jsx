import MessageBubble from "./MessageBubble";

export default function RoundSection({ round, roundNum, isLatest }) {
  return (
    <div style={{ marginBottom:28 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <div style={{ fontFamily:"monospace", fontSize:11, letterSpacing:"0.2em", color:"#ffffff30", textTransform:"uppercase" }}>Round {roundNum}</div>
        <div style={{ flex:1, height:1, background:"#ffffff10" }} />
        {round.userIntervention && (
          <div style={{ fontSize:11, color:"#a78bfa", fontStyle:"italic" }}>💬 {round.userIntervention}</div>
        )}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {round.messages.map((msg) => <MessageBubble key={msg.modelId} msg={msg} isNew={isLatest} />)}
      </div>
    </div>
  );
}
