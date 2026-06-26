import { useState } from "react";
import StanceMap from "./StanceMap";
import RoundTimeline from "./RoundTimeline";

// "現在の到達点" hero card: the at-a-glance verdict pinned above the transcript
// so a reader grasps the outcome (consensus / conflict / open questions + where
// each AI stands) without scrolling through three columns. Built entirely from
// already-computed summary data — no extra API cost.

const pts = (arr) => (Array.isArray(arr) ? arr.map((x) => (x && x.point) ? x.point : (typeof x === "string" ? x : null)).filter(Boolean) : []);

// Compare the two most recent rounds' conflict counts to label the trend.
function trendOf(summaries) {
  const valid = (summaries || []).filter(Boolean);
  if (valid.length < 2) return null;
  const a = valid[valid.length - 2];
  const b = valid[valid.length - 1];
  const da = Array.isArray(a.disagreements) ? a.disagreements.length : 0;
  const db = Array.isArray(b.disagreements) ? b.disagreements.length : 0;
  if (db < da) return { label: "収束に向かっています", color: "var(--success)", icon: "↘" };
  if (db > da) return { label: "対立が広がっています", color: "var(--warning)", icon: "↗" };
  return { label: "論点は平行線です", color: "var(--text2)", icon: "→" };
}

function Section({ icon, title, color, items, max = 2 }) {
  if (!items.length) return null;
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <div style={{ marginTop:8 }}>
      <div style={{ fontSize:11, fontWeight:700, color, marginBottom:4 }}>{icon} {title}（{items.length}）</div>
      <ul style={{ margin:0, paddingLeft:18, fontSize:12.5, color:"var(--text)", lineHeight:1.6 }}>
        {shown.map((t, i) => <li key={i}>{t}</li>)}
        {rest > 0 && <li style={{ listStyle:"none", marginLeft:-18, color:"var(--text3)", fontSize:11 }}>＋他 {rest} 件（下の各ラウンド詳細を参照）</li>}
      </ul>
    </div>
  );
}

export default function ConsensusCard({ summary, summaries, roundCount, conclusion, running }) {
  const [open, setOpen] = useState(true);
  if (!summary) return null;

  const agreements = pts(summary.agreements);
  const disagreements = pts(summary.disagreements);
  const unresolved = pts(summary.unresolved);
  const trend = trendOf(summaries);

  return (
    <div style={{ background:"var(--surface)", border:"1px solid var(--accent-bd)", borderRadius:12, marginBottom:20, overflow:"hidden" }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"12px 16px", background:"var(--accent-bg)", border:"none", cursor:"pointer", textAlign:"left", flexWrap:"wrap" }}>
        <span style={{ fontSize:14, fontWeight:700, color:"var(--text)" }}>📌 現在の到達点</span>
        <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"monospace" }}>Round {roundCount}{running ? " · 議論中…" : ""}</span>
        <span style={{ marginLeft:"auto", display:"flex", gap:10, alignItems:"center", fontFamily:"monospace", fontSize:12 }}>
          <span style={{ color:"var(--success)" }}>🤝 {agreements.length}</span>
          <span style={{ color:"var(--error)" }}>⚔️ {disagreements.length}</span>
          <span style={{ color:"var(--warning)" }}>❓ {unresolved.length}</span>
          <span style={{ color:"var(--text3)" }}>{open ? "▾" : "▸"}</span>
        </span>
      </button>

      {open && (
        <div style={{ padding:"12px 16px 16px" }}>
          {/* TL;DR / conclusion */}
          {conclusion ? (
            <div style={{ padding:"10px 12px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:8, marginBottom:10, fontSize:13.5, color:"var(--text)", fontWeight:500, lineHeight:1.6 }}>
              💡 {conclusion}
            </div>
          ) : (
            <div style={{ fontSize:13, color:"var(--text2)", marginBottom:10, lineHeight:1.6 }}>
              {agreements[0] ? <>🤝 主な合意: <b style={{ color:"var(--text)" }}>{agreements[0]}</b></> : "まだ明確な合意は出ていません。"}
              {disagreements[0] && <><br />⚔️ 主な対立: <b style={{ color:"var(--text)" }}>{disagreements[0]}</b></>}
            </div>
          )}

          {trend && (
            <div style={{ fontSize:11.5, color:trend.color, fontWeight:600, marginBottom:10 }}>
              {trend.icon} {trend.label}
            </div>
          )}

          {/* Stance map (where each AI stands) */}
          <div style={{ fontSize:11, color:"var(--text3)", fontWeight:700, marginBottom:6 }}>🧭 各AIの立場</div>
          <StanceMap stances={summary.stances} />

          {/* Top items */}
          <Section icon="🤝" title="合意点" color="var(--success)" items={agreements} />
          <Section icon="⚔️" title="対立点" color="var(--error)" items={disagreements} />
          <Section icon="❓" title="未解決" color="var(--warning)" items={unresolved} max={1} />

          {/* Round-by-round trend */}
          {(summaries || []).filter(Boolean).length >= 2 && (
            <div style={{ marginTop:12 }}>
              <div style={{ fontSize:11, color:"var(--text3)", fontWeight:700, marginBottom:6 }}>📈 議論の流れ</div>
              <RoundTimeline summaries={summaries} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
