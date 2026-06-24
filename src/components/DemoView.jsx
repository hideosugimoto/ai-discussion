import RoundSection from "./RoundSection";
import RoundSummary from "./RoundSummary";
import { SAMPLE_TOPIC, SAMPLE_DISCUSSION, SAMPLE_SUMMARIES } from "../sampleDiscussion";

// Read-only sample discussion so first-time visitors see the real output (3 AIs
// debating + auto summary) before committing to login / API keys. Static data,
// no network, no continuation — a pure "try before you buy" preview.
export default function DemoView({ onExit, onStart }) {
  const noPersonas = { claude: "", chatgpt: "", gemini: "" };
  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", color:"var(--text)", padding:"24px 16px 80px" }}>
      <div style={{ maxWidth:1100, margin:"0 auto" }}>
        <div style={{ marginBottom:16, padding:"10px 14px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:10, display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <div style={{ fontSize:13, color:"var(--accent-light)", fontWeight:600 }}>
            👀 これはサンプルです — 3つのAIが実際にこう議論します
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={onExit} style={{ padding:"6px 14px", background:"none", border:"1px solid var(--border)", borderRadius:8, color:"var(--text2)", cursor:"pointer", fontSize:12 }}>
              ← 戻る
            </button>
            <button onClick={onStart} style={{ padding:"6px 16px", background:"var(--accent)", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:12, fontWeight:700 }}>
              自分の議題で始める →
            </button>
          </div>
        </div>

        <div style={{ padding:"14px 16px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, marginBottom:16 }}>
          <div style={{ fontSize:11, color:"var(--text3)", fontFamily:"monospace", marginBottom:4 }}>議題（サンプル）</div>
          <div style={{ fontSize:15, color:"var(--text)", fontWeight:500 }}>{SAMPLE_TOPIC}</div>
        </div>

        {SAMPLE_DISCUSSION.map((round, i) => (
          <div key={i}>
            <RoundSection round={round} roundNum={i + 1} isLatest={i === SAMPLE_DISCUSSION.length - 1} personas={noPersonas} />
            {SAMPLE_SUMMARIES[i] && (
              <RoundSummary summary={SAMPLE_SUMMARIES[i]} roundNum={i + 1} onScrollToMessage={() => {}} />
            )}
          </div>
        ))}

        <div style={{ textAlign:"center", marginTop:24 }}>
          <button onClick={onStart} style={{ padding:"12px 28px", background:"var(--accent)", border:"none", borderRadius:24, color:"#fff", cursor:"pointer", fontSize:14, fontWeight:700 }}>
            自分の議題で始める →
          </button>
        </div>
      </div>
    </div>
  );
}
