import { MODELS } from "../constants";

// 賛否マトリクス: each contested point as a row, each AI's position as a cell.
// Surfaces *where* the 3 AIs split and *how* — the divergence a single-answer
// orchestrator collapses away. Built from summary.disagreements[].positions.
export default function DisagreementMatrix({ disagreements }) {
  const rows = (disagreements || []).filter(
    (d) => d && d.positions && typeof d.positions === "object" && Object.keys(d.positions).length > 0
  );
  if (!rows.length) return null;

  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ borderCollapse:"collapse", width:"100%", fontSize:12 }}>
        <thead>
          <tr>
            <th style={{ textAlign:"left", padding:"6px 8px", borderBottom:"1px solid var(--border)", color:"var(--text3)", fontWeight:700, minWidth:120 }}>論点</th>
            {MODELS.map((m) => (
              <th key={m.id} style={{ textAlign:"left", padding:"6px 8px", borderBottom:`2px solid ${m.color}`, color:m.color, fontWeight:700, minWidth:110 }}>
                {m.icon} {m.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => (
            <tr key={i}>
              <td style={{ padding:"7px 8px", borderBottom:"1px solid var(--border)", color:"var(--text)", fontWeight:600, verticalAlign:"top" }}>{d.point}</td>
              {MODELS.map((m) => (
                <td key={m.id} style={{ padding:"7px 8px", borderBottom:"1px solid var(--border)", color:"var(--text2)", verticalAlign:"top", lineHeight:1.5 }}>
                  {(d.positions[m.id] || "").trim() || <span style={{ color:"var(--text3)" }}>—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
