import { useState } from "react";
import RoundSummary from "./RoundSummary";
import MindMap from "./MindMap";
import DetailedMindMap from "./DetailedMindMap";
import HelpHint from "./HelpHint";

const TAB_BASE = { background:"none", border:"none", padding:"8px 12px", cursor:"pointer", fontSize:11, fontWeight:600, color:"var(--text2)" };

const TABS = [
  { id: "text", label: "テキスト", hint: "このラウンドの合意点/対立点/未解決/立場変化を文字で一覧表示" },
  { id: "map",  label: "サマリーマップ", hint: "このラウンドだけをマインドマップで可視化（軽量・高速）" },
  { id: "detailed", label: "詳細マップ", hint: "議論全体のテーマ別にAIの立場を可視化（重め・時間かかる）" },
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
        {TABS.map(({ id, label, hint }) => (
          <button key={id} onClick={() => handleTabClick(id)} title={hint}
            style={{ ...TAB_BASE, color:activeTab===id?"var(--text)":"var(--text2)", borderBottom:activeTab===id?"2px solid var(--accent)":"2px solid transparent" }}>
            {label}
          </button>
        ))}
        <button onClick={onToggleSidePanel} className="side-panel-toggle" aria-label="サイドパネル切替"
          title="サマリーをサイドパネル化（議論本文を見ながら参照したい時）"
          style={{ marginLeft:"auto", background:"none", border:"none", color:sidePanel?"var(--accent)":"var(--text3)", cursor:"pointer", padding:"8px 12px", fontSize:14 }}>
          ◫
        </button>
      </div>
      <HelpHint style={{ padding:"6px 12px 0" }}>
        テキスト=文字一覧 ／ サマリーマップ=このラウンドの図解 ／ 詳細マップ=議論全体をテーマ別に可視化（重め）
      </HelpHint>
      <div style={{ overflow:"auto" }}>
        {activeTab === "text" && <RoundSummary summary={summary} roundNum={roundNum} onScrollToMessage={onScrollToMessage} />}
        {activeTab === "map" && <MindMap summary={summary} />}
        {activeTab === "detailed" && <DetailedMindMap analysis={detailedAnalysis} />}
      </div>
    </div>
  );
}
