import { useState, useRef, useLayoutEffect } from "react";
import { MODELS } from "../constants";
import ModelBadge from "./ModelBadge";
import Markdown from "./Markdown";

const FALLBACK_MODEL = { name:"?", color:"var(--text2)", dimColor:"var(--border)", bg:"var(--surface)", icon:"?" };

// Long final messages are clamped to this height so a single round doesn't
// require endless scrolling (especially on mobile, where the 3 AIs stack).
const CLAMP_PX = 460;

export default function MessageBubble({ msg, isNew, persona }) {
  const model = MODELS.find((m) => m.id === msg.modelId) ?? FALLBACK_MODEL;
  const isStreaming = msg.loading && msg.text;
  const isFinal = !msg.loading && !!msg.text && !msg.error;

  const contentRef = useRef(null);
  const [overflowing, setOverflowing] = useState(false);
  // Older rounds start collapsed; the latest round stays expanded so the user
  // reads the freshest exchange without an extra tap.
  const [expanded, setExpanded] = useState(!!isNew);

  useLayoutEffect(() => {
    if (!isFinal || !contentRef.current) { setOverflowing(false); return; }
    setOverflowing(contentRef.current.scrollHeight > CLAMP_PX + 40);
  }, [isFinal, msg.text]);

  const clamp = isFinal && overflowing && !expanded;

  return (
    <div data-id={`msg-${msg.roundNum ?? 0}-${msg.modelId}`} style={{ display:"flex", flexDirection:"column", gap:6, animation:isNew&&!msg.loading?"fadeIn 0.4s ease":"none" }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
        <ModelBadge model={model} size="sm" />
        {persona && (
          <span style={{ fontSize:10, color:"var(--text2)", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:10, padding:"1px 8px" }}>
            {persona}
          </span>
        )}
      </div>
      <div className="msg-bubble" style={{ background:model.bg, border:`1px solid ${model.dimColor}`, borderLeft:`3px solid ${model.color}`, borderRadius:"0 10px 10px 10px", padding:"12px 16px", color:"var(--text)", fontSize:13.5, lineHeight:1.8, minHeight:48 }}>
        {msg.error
          ? <span style={{ color:"var(--error)" }}>⚠ {msg.error}</span>
          : msg.text
          ? (isStreaming
              ? <span style={{ whiteSpace:"pre-wrap" }}>{msg.text}<span style={{ animation:"blink 1s infinite", marginLeft:2 }}>▍</span></span>
              : (
                <>
                  <div
                    ref={contentRef}
                    style={clamp ? { maxHeight:CLAMP_PX, overflow:"hidden", position:"relative", maskImage:"linear-gradient(to bottom, #000 78%, transparent)", WebkitMaskImage:"linear-gradient(to bottom, #000 78%, transparent)" } : undefined}
                  >
                    <Markdown text={msg.text} />
                  </div>
                  {isFinal && overflowing && (
                    <button
                      onClick={() => setExpanded((v) => !v)}
                      style={{ marginTop:8, background:"none", border:"none", color:"var(--link)", cursor:"pointer", fontSize:12, fontWeight:600, padding:0 }}
                    >
                      {expanded ? "▲ 折りたたむ" : "▼ 全文を読む"}
                    </button>
                  )}
                </>
              ))
          : <span style={{ color:"var(--text3)", animation:"pulse 1.2s infinite" }}>考えています...</span>
        }
      </div>
    </div>
  );
}
