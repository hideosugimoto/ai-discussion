import { useState } from "react";
import RoundSummary from "./RoundSummary";
import MindMap from "./MindMap";

const TAB_BASE = { background:"none", border:"none", padding:"8px 14px", cursor:"pointer", fontSize:12, fontWeight:600, color:"#ffffff50" };

export default function SummaryPanel({ summary, roundNum, onScrollToMessage, sidePanel, onToggleSidePanel }) {
  const [activeTab, setActiveTab] = useState("text");

  return (
    <div className={sidePanel ? "summary-side-panel" : ""} style={{ background:"#10101a", border:"1px solid #2a2a3a", borderRadius:10, overflow:"hidden", marginTop:8, marginBottom:8 }}>
      <div style={{ display:"flex", borderBottom:"1px solid #2a2a3a", alignItems:"center" }}>
        <button onClick={() => setActiveTab("text")}
          style={{ ...TAB_BASE, color:activeTab==="text"?"#e2e8f0":"#ffffff50", borderBottom:activeTab==="text"?"2px solid #7c3aed":"2px solid transparent" }}>
          テキスト
        </button>
        <button onClick={() => setActiveTab("map")}
          style={{ ...TAB_BASE, color:activeTab==="map"?"#e2e8f0":"#ffffff50", borderBottom:activeTab==="map"?"2px solid #7c3aed":"2px solid transparent" }}>
          マップ
        </button>
        <button onClick={onToggleSidePanel} className="side-panel-toggle" aria-label="サイドパネル切替"
          style={{ marginLeft:"auto", background:"none", border:"none", color:sidePanel?"#7c3aed":"#ffffff40", cursor:"pointer", padding:"8px 12px", fontSize:14 }}>
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
