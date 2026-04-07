import { useState, useEffect, useCallback } from "react";
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

function bytesLabel(b) {
  if (!b) return "0KB";
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1024 / 1024).toFixed(2)}MB`;
}

// ── Local discussion item ────────────────────────────────────
function LocalItem({ item, onLoad, onAddContext, contextIds, onDelete }) {
  const inContext = contextIds.includes(item.id);
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", marginBottom:4, borderRadius:6, background:"var(--bg)", border:"1px solid var(--border)" }}>
      <button onClick={() => onLoad(item)} style={{ background:"none", border:"none", cursor:"pointer", textAlign:"left", flex:1, padding:0, color:"var(--text)" }}>
        <div style={{ fontSize:13, fontWeight:500 }}>{item.topic.slice(0, 50)}{item.topic.length > 50 ? "..." : ""}</div>
        <div style={{ fontSize:11, color:"var(--text3)", marginTop:2 }}>
          {item.roundCount}ラウンド · {timeAgo(item.createdAt)}
        </div>
      </button>
      {onAddContext && (
        <button
          onClick={() => onAddContext(item)}
          disabled={inContext}
          aria-label={inContext ? "文脈に追加済み" : "文脈に追加"}
          title={inContext ? "すでに文脈として追加済み" : "今回の議論にこの過去議論を文脈として追加"}
          style={{
            background:"none",
            border:`1px solid ${inContext ? "var(--success)" : "var(--accent-bd)"}`,
            color:inContext ? "var(--success)" : "var(--accent-light)",
            cursor:inContext ? "default" : "pointer",
            fontSize:10,
            padding:"4px 8px",
            borderRadius:6,
            marginRight:6,
            whiteSpace:"nowrap",
            opacity:inContext ? 0.7 : 1,
          }}
        >
          {inContext ? "✓ 文脈" : "+ 文脈"}
        </button>
      )}
      <button onClick={() => onDelete(item.id)} aria-label="削除" style={{ background:"none", border:"none", color:"var(--text3)", cursor:"pointer", fontSize:14, padding:"4px 8px" }}>
        ✕
      </button>
    </div>
  );
}

// ── Cloud discussion item ────────────────────────────────────
function CloudItem({ item, onLoad, onAddContext, contextIds, onDelete }) {
  const inContext = contextIds.includes(item.id);
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 10px", marginBottom:4, borderRadius:6, background:"var(--bg)", border:"1px solid var(--border)" }}>
      <button onClick={() => onLoad(item)} style={{ background:"none", border:"none", cursor:"pointer", textAlign:"left", flex:1, padding:0, color:"var(--text)" }}>
        <div style={{ fontSize:13, fontWeight:500, display:"flex", alignItems:"center", gap:6 }}>
          <span>☁</span>
          <span>{item.topic.slice(0, 50)}{item.topic.length > 50 ? "..." : ""}</span>
        </div>
        <div style={{ fontSize:11, color:"var(--text3)", marginTop:2, display:"flex", gap:8, flexWrap:"wrap" }}>
          <span>{item.roundCount}ラウンド</span>
          <span>{timeAgo(item.updatedAt)}</span>
          <span>{bytesLabel(item.sizeBytes)}</span>
          {item.tags?.length > 0 && (
            <span style={{ color:"var(--accent-light)" }}>#{item.tags.join(" #")}</span>
          )}
        </div>
      </button>
      {onAddContext && (
        <button
          onClick={() => onAddContext(item)}
          disabled={inContext}
          aria-label={inContext ? "文脈に追加済み" : "文脈に追加"}
          title={inContext ? "すでに文脈として追加済み" : "今回の議論にこの過去議論を文脈として追加"}
          style={{
            background:"none",
            border:`1px solid ${inContext ? "var(--success)" : "var(--accent-bd)"}`,
            color:inContext ? "var(--success)" : "var(--accent-light)",
            cursor:inContext ? "default" : "pointer",
            fontSize:10,
            padding:"4px 8px",
            borderRadius:6,
            marginRight:6,
            whiteSpace:"nowrap",
            opacity:inContext ? 0.7 : 1,
          }}
        >
          {inContext ? "✓ 文脈" : "+ 文脈"}
        </button>
      )}
      <button onClick={() => onDelete(item.id)} aria-label="削除" style={{ background:"none", border:"none", color:"var(--text3)", cursor:"pointer", fontSize:14, padding:"4px 8px" }}>
        ✕
      </button>
    </div>
  );
}

export default function HistoryPanel({
  open,
  onLoad,
  onAddContext,
  contextIds = [],
  cloudHistory,
  isPremium,
}) {
  const [activeTab, setActiveTab] = useState("local"); // "local" | "cloud"
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null); // null = not searched yet
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // Load local history
  useEffect(() => {
    if (open && activeTab === "local") {
      setLoading(true);
      loadHistory()
        .then(setHistory)
        .catch(() => setHistory([]))
        .finally(() => setLoading(false));
    }
  }, [open, activeTab]);

  // Load cloud history
  useEffect(() => {
    if (open && activeTab === "cloud" && cloudHistory) {
      cloudHistory.list();
      setSearchResults(null);
      setSearchQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab]);

  const handleDeleteLocal = useCallback(async (id) => {
    if (!window.confirm("この議論を削除しますか？")) return;
    try {
      await deleteDiscussion(id);
      setHistory((h) => h.filter((item) => item.id !== id));
    } catch {
      // ignore
    }
  }, []);

  const handleDeleteCloud = useCallback(async (id) => {
    if (!cloudHistory) return;
    if (!window.confirm("クラウドからこの議論を削除しますか？端末側の履歴は残ります。")) return;
    try {
      await cloudHistory.remove(id);
      if (searchResults) {
        setSearchResults((r) => r.filter((item) => item.id !== id));
      }
    } catch (e) {
      window.alert(`削除に失敗しました: ${e.message}`);
    }
  }, [cloudHistory, searchResults]);

  // Cloud item → fetch full data and convert to local-shape for App.jsx
  const handleLoadCloud = useCallback(async (item) => {
    if (!cloudHistory) return;
    try {
      const full = await cloudHistory.fetchOne(item.id);
      if (!full) return;
      const parsed = JSON.parse(full.dataJson);
      onLoad({
        id: full.id,
        topic: full.topic,
        discussion: parsed.discussion || [],
        summaries: parsed.summaries || [],
        mode: parsed.mode || "best",
        discussionMode: parsed.discussionMode || "standard",
        conclusionTarget: parsed.conclusionTarget || "claude",
        personas: parsed.personas || { claude:"", chatgpt:"", gemini:"" },
        roundCount: full.roundCount,
        createdAt: full.createdAt,
      });
    } catch (e) {
      window.alert(`読み込みに失敗しました: ${e.message}`);
    }
  }, [cloudHistory, onLoad]);

  const handleAddContextFromCloud = useCallback(async (item) => {
    if (!cloudHistory || !onAddContext) return;
    try {
      const full = await cloudHistory.fetchOne(item.id);
      if (!full) return;
      const parsed = JSON.parse(full.dataJson);
      onAddContext({
        id: full.id,
        topic: full.topic,
        summaries: parsed.summaries || [],
      });
    } catch (e) {
      window.alert(`取得に失敗しました: ${e.message}`);
    }
  }, [cloudHistory, onAddContext]);

  const handleSearch = useCallback(async () => {
    if (!cloudHistory) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const results = await cloudHistory.search(q, "");
    setSearchResults(results);
  }, [cloudHistory, searchQuery]);

  const handleBulkUpload = useCallback(async () => {
    if (!cloudHistory) return;
    if (!window.confirm(`端末内の ${history.length} 件をクラウドにアップロードします。よろしいですか？`)) return;
    setBulkUploading(true);
    setBulkResult(null);
    try {
      // Build payload chunks of 30 items each (server limit MAX_BULK_ITEMS=30)
      const items = history.map((h) => ({
        clientId: h.id,
        topic: h.topic,
        data_json: JSON.stringify({
          discussion: h.discussion,
          summaries: h.summaries,
          mode: h.mode,
          discussionMode: h.discussionMode,
          personas: h.personas,
          conclusionTarget: h.conclusionTarget,
        }),
        tags: [],
      }));

      let totalCreated = 0;
      let totalSkipped = 0;
      const skippedReasons = {};
      for (let i = 0; i < items.length; i += 30) {
        const chunk = items.slice(i, i + 30);
        const res = await cloudHistory.bulkUpload(chunk);
        totalCreated += (res?.created || []).length;
        for (const sk of res?.skipped || []) {
          totalSkipped++;
          skippedReasons[sk.reason] = (skippedReasons[sk.reason] || 0) + 1;
        }
        if (res?.skipped?.some((s) => s.reason === "limit_reached")) break;
      }
      setBulkResult({ created: totalCreated, skipped: totalSkipped, reasons: skippedReasons });
      await cloudHistory.list();
    } catch (e) {
      setBulkResult({ error: e.message });
    } finally {
      setBulkUploading(false);
    }
  }, [cloudHistory, history]);

  if (!open) return null;

  const cloudItems = searchResults !== null ? searchResults : (cloudHistory?.items || []);

  return (
    <div style={{ padding:14, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10 }}>
      {/* Tabs */}
      {isPremium && cloudHistory && (
        <div style={{ display:"flex", gap:6, marginBottom:12, borderBottom:"1px solid var(--border)" }}>
          {[
            { id:"local", label:"📂 端末（最大50件）" },
            { id:"cloud", label:"☁ クラウド（Premium）" },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                background:"none",
                border:"none",
                padding:"8px 12px",
                cursor:"pointer",
                fontSize:12,
                fontWeight:600,
                color:activeTab === id ? "var(--text)" : "var(--text3)",
                borderBottom:activeTab === id ? "2px solid var(--accent)" : "2px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Local tab */}
      {activeTab === "local" && (
        <>
          {loading && <div style={{ color:"var(--text3)", fontSize:12 }}>読み込み中...</div>}
          {!loading && history.length === 0 && (
            <div style={{ color:"var(--text3)", fontSize:12 }}>保存された議論はありません</div>
          )}
          {!loading && history.map((item) => (
            <LocalItem
              key={item.id}
              item={item}
              onLoad={onLoad}
              onAddContext={onAddContext}
              contextIds={contextIds}
              onDelete={handleDeleteLocal}
            />
          ))}
        </>
      )}

      {/* Cloud tab */}
      {activeTab === "cloud" && cloudHistory && (
        <>
          {/* Capacity indicator */}
          <div style={{ marginBottom:10, padding:"8px 10px", background:"var(--bg)", borderRadius:6, fontSize:11, color:"var(--text2)", display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:6 }}>
            <span>{cloudHistory.total}/{cloudHistory.limit} 件 · {bytesLabel(cloudHistory.totalBytes)}</span>
            <span style={{ color:"var(--text3)" }}>新規議論はクラウドにも自動保存されます</span>
          </div>

          {/* Search */}
          <div style={{ display:"flex", gap:6, marginBottom:10 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder="クラウド全文検索（議題・本文）"
              aria-label="クラウド全文検索"
              style={{ flex:1, padding:"6px 10px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, color:"var(--text)", fontSize:12 }}
            />
            <button
              onClick={handleSearch}
              disabled={cloudHistory.loading}
              style={{ padding:"6px 14px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:6, color:"var(--accent-light)", cursor:"pointer", fontSize:11 }}
            >
              🔍 検索
            </button>
            {searchResults !== null && (
              <button
                onClick={() => { setSearchResults(null); setSearchQuery(""); }}
                style={{ padding:"6px 10px", background:"none", border:"1px solid var(--border)", borderRadius:6, color:"var(--text3)", cursor:"pointer", fontSize:11 }}
              >
                クリア
              </button>
            )}
          </div>

          {/* Bulk upload (only when local has items) */}
          {history.length > 0 && (
            <div style={{ marginBottom:10, padding:"8px 10px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:6, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:6 }}>
              <span style={{ fontSize:11, color:"var(--accent-light)" }}>
                端末に {history.length} 件あります。クラウドに移行できます。
              </span>
              <button
                onClick={handleBulkUpload}
                disabled={bulkUploading}
                style={{ padding:"6px 12px", background:"var(--accent)", border:"none", borderRadius:6, color:"#fff", cursor:bulkUploading?"not-allowed":"pointer", fontSize:11, fontWeight:600 }}
              >
                {bulkUploading ? "アップロード中..." : "☁ 一括アップロード"}
              </button>
            </div>
          )}

          {bulkResult && (
            <div style={{ marginBottom:10, padding:"8px 10px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:6, fontSize:11, color:"var(--text2)" }}>
              {bulkResult.error
                ? <span style={{ color:"var(--error)" }}>失敗: {bulkResult.error}</span>
                : <span>✓ 作成 {bulkResult.created}件 / スキップ {bulkResult.skipped}件{bulkResult.skipped > 0 ? ` (${Object.entries(bulkResult.reasons).map(([k,v]) => `${k}:${v}`).join(", ")})` : ""}</span>}
            </div>
          )}

          {cloudHistory.loading && <div style={{ color:"var(--text3)", fontSize:12 }}>読み込み中...</div>}
          {cloudHistory.error && <div style={{ color:"var(--error)", fontSize:12, marginBottom:8 }}>⚠ {cloudHistory.error}</div>}
          {!cloudHistory.loading && cloudItems.length === 0 && (
            <div style={{ color:"var(--text3)", fontSize:12 }}>
              {searchResults !== null ? "該当する議論がありません" : "クラウドに保存された議論はありません"}
            </div>
          )}
          {cloudItems.map((item) => (
            <CloudItem
              key={item.id}
              item={item}
              onLoad={handleLoadCloud}
              onAddContext={onAddContext ? handleAddContextFromCloud : undefined}
              contextIds={contextIds}
              onDelete={handleDeleteCloud}
            />
          ))}
        </>
      )}
    </div>
  );
}
