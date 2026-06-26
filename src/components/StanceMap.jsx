import { MODELS } from "../constants";

// Visualizes where each of the 3 AIs currently stands — the "split" that a
// single-answer orchestrator (e.g. Fugu) hides. `stances` is { claude, chatgpt,
// gemini } of short strings. Empty stances render as a muted dash.
export default function StanceMap({ stances, compact }) {
  if (!stances || typeof stances !== "object") return null;
  return (
    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
      {MODELS.map((m) => {
        const stance = (stances[m.id] || "").trim();
        return (
          <div key={m.id} style={{ flex:"1 1 160px", minWidth:0, background:m.bg, border:`1px solid ${m.dimColor}`, borderLeft:`3px solid ${m.color}`, borderRadius:8, padding:compact?"6px 10px":"8px 12px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
              <span style={{ color:m.color, fontSize:12, fontWeight:700 }}>{m.icon} {m.name}</span>
            </div>
            <div style={{ fontSize:12, color:stance?"var(--text)":"var(--text3)", lineHeight:1.5 }}>
              {stance || "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
