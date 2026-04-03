import { useState, useEffect } from "react";
import { loadHistory, deleteDiscussion } from "../history";

function timeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  if (isNaN(diff)) return "不明";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}日前`;
  return new Date(isoStr).toLocaleDateString("ja-JP");
}

export default function HistoryPanel({ open, onLoad }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      loadHistory()
        .then(setHistory)
        .catch(() => setHistory([]))
        .finally(() => setLoading(false));
    }
  }, [open]);

  const handleDelete = async (id) => {
    if (!window.confirm("この議論を削除しますか？")) return;
    try {
      await deleteDiscussion(id);
      setHistory((h) => h.filter((item) => item.id !== id));
    } catch {
      // deletion failed - keep item in list
    }
  };

  if (!open) return null;

  return (
    <div style={{ padding:14, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10 }}>
      {loading && <div style={{ color:"var(--text3)", fontSize:12 }}>読み込み中...</div>}
      {!loading && history.length === 0 && (
        <div style={{ color:"var(--text3)", fontSize:12 }}>保存された議論はありません</div>
      )}
      {!loading && history.map((item) => (
        <div key={item.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", marginBottom:4, borderRadius:6, background:"var(--bg)", border:"1px solid var(--border)" }}>
          <button onClick={() => onLoad(item)} style={{ background:"none", border:"none", cursor:"pointer", textAlign:"left", flex:1, padding:0, color:"var(--text)" }}>
            <div style={{ fontSize:13, fontWeight:500 }}>{item.topic.slice(0, 50)}{item.topic.length > 50 ? "..." : ""}</div>
            <div style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>
              {item.roundCount}ラウンド · {timeAgo(item.createdAt)}
            </div>
          </button>
          <button onClick={() => handleDelete(item.id)} aria-label="削除" style={{ background:"none", border:"none", color:"var(--text3)", cursor:"pointer", fontSize:14, padding:"4px 8px" }}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
