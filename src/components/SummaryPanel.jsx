import { useState } from "react";
import RoundSummary from "./RoundSummary";
import MindMap from "./MindMap";

const TAB_BASE = { background:"none", border:"none", padding:"8px 14px", cursor:"pointer", fontSize:12, fontWeight:600, color:"var(--text2)" };

export default function SummaryPanel({ summary, roundNum, onScrollToMessage, sidePanel, onToggleSidePanel }) {
  const [activeTab, setActiveTab] = useState("text");

  return (
    <div className={sidePanel ? "summary-side-panel" : ""} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, overflow:"hidden", marginTop:8, marginBottom:8 }}>
      <div style={{ display:"flex", borderBottom:"1px solid var(--border)", alignItems:"center" }}>
        <button onClick={() => setActiveTab("text")}
          style={{ ...TAB_BASE, color:activeTab==="text"?"var(--text)":"var(--text2)", borderBottom:activeTab==="text"?"2px solid var(--accent)":"2px solid transparent" }}>
          テキスト
        </button>
        <button onClick={() => setActiveTab("map")}
          style={{ ...TAB_BASE, color:activeTab==="map"?"var(--text)":"var(--text2)", borderBottom:activeTab==="map"?"2px solid var(--accent)":"2px solid transparent" }}>
          マップ
        </button>
        <button onClick={onToggleSidePanel} className="side-panel-toggle" aria-label="サイドパネル切替"
          style={{ marginLeft:"auto", background:"none", border:"none", color:sidePanel?"var(--accent)":"var(--text3)", cursor:"pointer", padding:"8px 12px", fontSize:14 }}>
          ◫
        </button>
      </div>
      <div style={{ overflow:"auto" }}>
        {activeTab === "text"
          ? <RoundSummary summary={summary} roundNum={roundNum} onScrollToMessage={onScrollToMessage} />
          : <MindMap summary={summary} />
        }
      </div>
    </div>
  );
}
