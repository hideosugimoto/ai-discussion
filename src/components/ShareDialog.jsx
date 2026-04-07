import { useEffect, useRef } from "react";

// Modal dialog for displaying share creation status (creating / success / error).
// Receives `state`:
//   - "creating"             — spinner
//   - { url: "..." }         — success view with copyable URL
//   - { error: "..." }       — failure view
//   - null                   — not shown
export default function ShareDialog({ state, onClose }) {
  const dialogRef = useRef(null);

  // ESC key closes the dialog (unless we're mid-creation)
  useEffect(() => {
    if (!state || state === "creating") return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, onClose]);

  // Auto-focus the dialog when it opens for keyboard users
  useEffect(() => {
    if (state && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [state]);

  if (!state) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
      onClick={() => state !== "creating" && onClose()}
      style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:16 }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:24, maxWidth:540, width:"100%", outline:"none" }}
      >
        {state === "creating" && (
          <div style={{ textAlign:"center", color:"var(--text2)" }}>
            <div id="share-dialog-title" style={{ fontSize:14, marginBottom:8 }}>共有リンクを作成中...</div>
          </div>
        )}
        {state.url && (
          <>
            <div id="share-dialog-title" style={{ fontSize:15, fontWeight:700, color:"var(--text)", marginBottom:8 }}>✓ 共有リンクを作成しました</div>
            <div style={{ fontSize:11, color:"var(--text3)", marginBottom:12 }}>URL はクリップボードにコピー済みです（コピーできない環境では下のテキストをご利用ください）。</div>
            <input
              readOnly
              value={state.url}
              onFocus={(e) => e.target.select()}
              style={{ width:"100%", padding:"10px 12px", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text)", fontSize:12, fontFamily:"monospace", marginBottom:14 }}
            />
            <div style={{ fontSize:11, color:"var(--text3)", marginBottom:14, lineHeight:1.6 }}>
              ⚠ このリンクを知っている人は誰でも閲覧できます。検索エンジンには載りません。<br />
              共有を取り消すには、議論を再開した状態で「共有」ボタンから管理してください（この機能は次のアップデートで追加予定）。
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button
                onClick={onClose}
                style={{ padding:"8px 18px", background:"var(--accent)", border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}
              >
                閉じる (ESC)
              </button>
            </div>
          </>
        )}
        {state.error && (
          <>
            <div id="share-dialog-title" style={{ fontSize:15, fontWeight:700, color:"var(--error)", marginBottom:8 }}>✗ 共有に失敗しました</div>
            <div style={{ fontSize:12, color:"var(--text2)", marginBottom:14 }}>{state.error}</div>
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <button
                onClick={onClose}
                style={{ padding:"8px 18px", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text2)", cursor:"pointer", fontSize:13 }}
              >
                閉じる (ESC)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
