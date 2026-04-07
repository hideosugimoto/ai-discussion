import { useEffect, useState } from "react";
import { fetchSharedDiscussion } from "../hooks/useShare";
import RoundSection from "./RoundSection";
import RoundSummary from "./RoundSummary";

export default function SharedView({ shareId, onExit }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSharedDiscussion(shareId)
      .then((d) => {
        if (cancelled) return;
        if (!d) {
          setError("共有が見つかりません");
          return;
        }
        try {
          const parsed = JSON.parse(d.dataJson);
          setData({
            id: d.id,
            topic: d.topic,
            viewCount: d.viewCount,
            createdAt: d.createdAt,
            discussion: Array.isArray(parsed.discussion) ? parsed.discussion : [],
            summaries: Array.isArray(parsed.summaries) ? parsed.summaries : [],
          });
        } catch {
          setError("データの解析に失敗しました");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [shareId]);

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", color:"var(--text)", padding:"24px 16px 80px" }}>
      <div style={{ maxWidth:900, margin:"0 auto" }}>
        {/* Banner */}
        <div style={{ marginBottom:16, padding:"10px 14px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:10, display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <div style={{ fontSize:13, color:"var(--accent-light)" }}>
            🔗 共有された議論を表示中（読み取り専用）
          </div>
          <button
            onClick={onExit}
            style={{ padding:"6px 14px", background:"var(--accent)", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600 }}
          >
            自分の議論を始める →
          </button>
        </div>

        {loading && (
          <div style={{ padding:40, textAlign:"center", color:"var(--text3)", fontSize:13 }}>読み込み中...</div>
        )}

        {error && !loading && (
          <div style={{ padding:20, background:"var(--surface)", border:"1px solid var(--error)", borderRadius:10, color:"var(--error)", fontSize:13 }}>
            ⚠ {error}
          </div>
        )}

        {data && !loading && !error && (
          <>
            {/* Topic */}
            <div style={{ padding:"14px 16px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, marginBottom:16 }}>
              <div style={{ fontSize:11, color:"var(--text3)", fontFamily:"monospace", marginBottom:4 }}>議題</div>
              <div style={{ fontSize:15, color:"var(--text)", fontWeight:500, marginBottom:8 }}>{data.topic}</div>
              <div style={{ fontSize:11, color:"var(--text3)", display:"flex", gap:12, flexWrap:"wrap" }}>
                <span>{data.discussion.length} ラウンド</span>
                <span>{data.viewCount} 回閲覧</span>
                <span>{new Date(data.createdAt).toLocaleDateString("ja-JP")}</span>
              </div>
            </div>

            {/* Disclaimer */}
            <div style={{ marginBottom:16, padding:"8px 12px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, fontSize:11, color:"var(--text3)" }}>
              ※ 共有データには議論本文と要約のみが含まれます。投稿者のプロフィール・ペルソナ・憲法・司会者介入は除外されています。
            </div>

            {/* Rounds */}
            {data.discussion.map((round, i) => (
              <div key={i}>
                <RoundSection
                  round={round}
                  roundNum={i + 1}
                  isLatest={i === data.discussion.length - 1}
                  personas={{ claude:"", chatgpt:"", gemini:"" }}
                />
                {data.summaries[i] && !data.summaries[i].error && !round.isConclusion && (
                  <RoundSummary summary={data.summaries[i]} roundNum={i + 1} onScrollToMessage={() => {}} />
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
