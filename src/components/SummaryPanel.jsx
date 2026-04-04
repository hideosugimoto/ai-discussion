import { useState } from "react";
import RoundSummary from "./RoundSummary";
import MindMap from "./MindMap";
import DetailedMindMap from "./DetailedMindMap";

const TAB_BASE = { background:"none", border:"none", padding:"8px 12px", cursor:"pointer", fontSize:11, fontWeight:600, color:"var(--text2)" };

const TABS = [
  { id: "text", label: "テキスト" },
  { id: "map",  label: "サマリーマップ" },
  { id: "detailed", label: "詳細マップ" },
];

export default function SummaryPanel({ summary, roundNum, onScrollToMessage, sidePanel, onToggleSidePanel, detailedAnalysis, onRequestDetailed }) {
  const [activeTab, setActiveTab] = useState("text");

  const handleTabClick = (tabId) => {
    setActiveTab(tabId);
    if (tabId === "detailed" && !detailedAnalysis && onRequestDetailed) {
      onRequestDetailed();
    }
  };

  return (
    <div className={`${sidePanel ? "summary-side-panel" : ""} summary-card`} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, overflow:"hidden", marginTop:8, marginBottom:8 }}>
      <div style={{ display:"flex", borderBottom:"1px solid var(--border)", alignItems:"center", flexWrap:"wrap" }}>
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => handleTabClick(id)}
            style={{ ...TAB_BASE, color:activeTab===id?"var(--text)":"var(--text2)", borderBottom:activeTab===id?"2px solid var(--accent)":"2px solid transparent" }}>
            {label}
          </button>
        ))}
        <button onClick={onToggleSidePanel} className="side-panel-toggle" aria-label="サイドパネル切替"
          style={{ marginLeft:"auto", background:"none", border:"none", color:sidePanel?"var(--accent)":"var(--text3)", cursor:"pointer", padding:"8px 12px", fontSize:14 }}>
          ◫
        </button>
      </div>
      <div style={{ overflow:"auto" }}>
        {activeTab === "text" && <RoundSummary summary={summary} roundNum={roundNum} onScrollToMessage={onScrollToMessage} />}
        {activeTab === "map" && <MindMap summary={summary} />}
        {activeTab === "detailed" && <DetailedMindMap analysis={detailedAnalysis} />}
      </div>
    </div>
  );
}
