import { useState } from "react";
import { MODELS } from "../constants";

const AI_COLORS = Object.fromEntries(MODELS.map((m) => [m.id, m.color]));

const SECTIONS = [
  { key: "agreements", title: "合意点", color: "#4ade80" },
  { key: "disagreements", title: "対立点", color: "#ef4444" },
  { key: "unresolved", title: "未解決", color: "#f59e0b" },
  { key: "positionChanges", title: "立場変化", color: "#a78bfa" },
];

function AiDot({ ai }) {
  return (
    <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", marginRight:4, background:AI_COLORS[ai] || "#888" }} />
  );
}

export default function RoundSummary({ summary, roundNum, onScrollToMessage }) {
  const [open, setOpen] = useState(true);

  if (!summary) {
    return (
      <div style={{ padding:14 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ background:"#2a2a3a", height:14, borderRadius:4, marginBottom:8, animation:"pulse 1.2s infinite" }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ background:"#10101a", border:"1px solid #2a2a3a", borderRadius:10, overflow:"hidden", marginTop:8, marginBottom:8 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ width:"100%", background:"none", border:"none", padding:"10px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:8, color:"#e2e8f0", fontSize:12, fontFamily:"monospace" }}>
        <span>{open ? "▾" : "▸"}</span>
        <span>📊 議論サマリー（Round {roundNum}）</span>
      </button>
      {open && (
        <div style={{ padding:"0 14px 14px" }}>
          {SECTIONS.map(({ key, title, color }) => {
            const items = summary[key] || [];
            if (!items.length) return null;
            return (
              <div key={key} style={{ marginTop:12 }}>
                <div style={{ color, fontSize:12, fontWeight:700, marginBottom:6 }}>{title}（{items.length}件）</div>
                {items.map((item, idx) => (
                  <div key={idx}
                    onClick={() => item.quote && onScrollToMessage?.(item.quote)}
                    style={{ padding:"6px 10px", marginBottom:4, borderRadius:6, background:"#0d0d1a", cursor:item.quote?"pointer":"default", fontSize:13, lineHeight:1.6 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
                      {key === "agreements" && item.supporters?.map((ai) => <AiDot key={ai} ai={ai} />)}
                      {key === "unresolved" && <AiDot ai={item.raisedBy} />}
                      {key === "positionChanges" && <AiDot ai={item.ai} />}
                      <span style={{ color:"#e2e8f0" }}>
                        {key === "positionChanges" ? item.description : item.point}
                      </span>
                    </div>
                    {key === "disagreements" && item.positions && (
                      <div style={{ marginLeft:16, marginTop:4 }}>
                        {Object.entries(item.positions).map(([ai, desc]) => (
                          <div key={ai} style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:"#ffffff70", marginBottom:2 }}>
                            <AiDot ai={ai} />
                            <span>{desc}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {item.quote && (
                      <div style={{ fontSize:11, color:"#ffffff30", marginTop:2 }}>「{item.quote}」</div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
