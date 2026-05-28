import { useRef, useState, useCallback } from "react";
import {
  parseFile,
  validateAttachment,
  formatBytes,
  shouldSummarize,
  MAX_FILES,
  MAX_TOTAL_BYTES,
  SUMMARY_THRESHOLD_BYTES,
} from "../lib/fileParser";

function Chip({ attachment, onRemove, disabled }) {
  const summarised = !!attachment.summary;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:6,
      background:"var(--bg)", border:"1px solid var(--border)", borderRadius:14,
      padding:"3px 8px 3px 10px", fontSize:11, color:"var(--text)",
      maxWidth:240,
    }}>
      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={attachment.name}>
        📄 {attachment.name}
      </span>
      {summarised && (
        <span style={{ color:"var(--accent)", fontSize:10 }} title="要約版を送信中">📝</span>
      )}
      <span style={{ color:"var(--text3)", fontSize:10 }}>{formatBytes(attachment.size)}</span>
      <button
        onClick={() => onRemove(attachment.id)} disabled={disabled}
        aria-label={`${attachment.name} を削除`}
        style={{
          background:"none", border:"none", padding:"0 2px",
          color:"var(--text3)", cursor: disabled ? "not-allowed" : "pointer",
          fontSize:14, lineHeight:1,
        }}
      >×</button>
    </span>
  );
}

function SummaryModeToggle({ value, onChange, disabled }) {
  const options = [
    { id: "auto", label: "Auto" },
    { id: "on",   label: "ON"   },
    { id: "off",  label: "OFF"  },
  ];
  return (
    <span role="radiogroup" aria-label="要約モード" style={{
      display:"inline-flex", border:"1px solid var(--border)", borderRadius:6, overflow:"hidden",
    }}>
      {options.map((o, i) => (
        <button
          key={o.id}
          role="radio" aria-checked={value === o.id}
          onClick={() => !disabled && onChange(o.id)}
          disabled={disabled}
          style={{
            border:"none",
            borderLeft: i === 0 ? "none" : "1px solid var(--border)",
            background: value === o.id ? "var(--accent)" : "transparent",
            color: value === o.id ? "#fff" : "var(--text3)",
            padding:"2px 8px", fontSize:10,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >{o.label}</button>
      ))}
    </span>
  );
}

export default function FileAttachment({ attachments, setAttachments, disabled, summaryMode = "auto", setSummaryMode }) {
  const inputRef = useRef(null);
  const [error, setError]   = useState("");
  const [warn,  setWarn]    = useState("");
  const [busy,  setBusy]    = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const totalBytes = attachments.reduce((s, a) => s + (a.size || 0), 0);

  const handleFiles = useCallback(async (files) => {
    setError(""); setWarn("");
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      let list = attachments;
      const warnings = [];
      for (const file of files) {
        const check = validateAttachment(list, file);
        if (!check.ok) { setError(check.reason); break; }
        if (check.warn) warnings.push(`${file.name}: ${check.warn}`);
        try {
          const parsed = await parseFile(file);
          list = [...list, parsed];
          setAttachments(list);
        } catch (e) {
          setError(`${file.name}: ${e.message || "解析に失敗しました"}`);
          break;
        }
      }
      if (warnings.length) setWarn(warnings.join(" / "));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [attachments, setAttachments]);

  const onInputChange = (e) => handleFiles(Array.from(e.target.files || []));

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled || busy) return;
    handleFiles(Array.from(e.dataTransfer.files || []));
  };

  const removeOne = (id) => {
    setAttachments(attachments.filter((a) => a.id !== id));
    setError(""); setWarn("");
  };

  const clickPick = () => {
    if (disabled || busy) return;
    inputRef.current?.click();
  };

  const canAddMore = attachments.length < MAX_FILES && totalBytes < MAX_TOTAL_BYTES;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled && !busy) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={{
        padding:"8px 12px", borderTop:"1px solid var(--border)",
        background: dragOver ? "var(--accent-bg, rgba(99,102,241,0.08))" : "transparent",
        transition:"background 0.15s",
      }}
    >
      <input
        ref={inputRef} type="file" multiple
        accept=".txt,.md,.markdown,.csv,.tsv,.json,.log,.yml,.yaml,.xml,.html,.htm,.pdf,.docx"
        onChange={onInputChange} disabled={disabled || busy}
        style={{ display:"none" }} aria-label="ファイル添付"
      />
      <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <button
          onClick={clickPick}
          disabled={disabled || busy || !canAddMore}
          title={!canAddMore ? "上限に達しています" : "クリック or ドラッグ&ドロップで添付"}
          style={{
            background:"transparent", border:"1px dashed var(--border)", borderRadius:8,
            padding:"4px 10px", fontSize:11, color: canAddMore ? "var(--text3)" : "var(--text3)",
            cursor: (disabled || busy || !canAddMore) ? "not-allowed" : "pointer",
            opacity: (disabled || !canAddMore) ? 0.5 : 1,
          }}
        >
          {busy ? "📎 解析中..." : "📎 ファイル添付"}
        </button>
        {attachments.map((a) => (
          <Chip key={a.id} attachment={a} onRemove={removeOne} disabled={disabled || busy} />
        ))}
        <span style={{ fontSize:10, color:"var(--text3)", marginLeft:"auto" }}>
          {attachments.length}/{MAX_FILES} · {formatBytes(totalBytes)}/{formatBytes(MAX_TOTAL_BYTES)}
        </span>
      </div>
      {error && (
        <div role="alert" style={{ marginTop:6, fontSize:11, color:"var(--danger, #e85f5c)" }}>
          ⚠ {error}
        </div>
      )}
      {warn && !error && (
        <div style={{ marginTop:6, fontSize:11, color:"var(--warning, #d97706)" }}>
          ⚠ {warn}
        </div>
      )}
      {attachments.length > 0 && setSummaryMode && (
        <div style={{ marginTop:6, display:"flex", flexWrap:"wrap", alignItems:"center", gap:6, fontSize:10, color:"var(--text3)" }}>
          <span>📝 要約モード:</span>
          <SummaryModeToggle value={summaryMode} onChange={setSummaryMode} disabled={disabled || busy} />
          {summaryMode === "auto" && (
            shouldSummarize("auto", attachments)
              ? <span style={{ color:"var(--accent)" }}>合計 {formatBytes(SUMMARY_THRESHOLD_BYTES)} 超のため自動ON（次のラウンドで要約します）</span>
              : <span>合計 {formatBytes(SUMMARY_THRESHOLD_BYTES)} 超で自動的に要約に切替</span>
          )}
          {summaryMode === "on"  && <span style={{ color:"var(--accent)" }}>常に要約を送信（次のラウンドで要約します）</span>}
          {summaryMode === "off" && <span>添付を全文送信</span>}
        </div>
      )}
    </div>
  );
}
