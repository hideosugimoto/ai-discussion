import { MODELS } from "../constants";
import ModelBadge from "./ModelBadge";

const FALLBACK_MODEL = { name:"?", color:"var(--text2)", dimColor:"var(--border)", bg:"var(--surface)", icon:"?" };

export default function MessageBubble({ msg, isNew, persona }) {
  const model = MODELS.find((m) => m.id === msg.modelId) ?? FALLBACK_MODEL;
  const isStreaming = msg.loading && msg.text;
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
      <div className="msg-bubble" style={{ background:model.bg, border:`1px solid ${model.dimColor}`, borderLeft:`3px solid ${model.color}`, borderRadius:"0 10px 10px 10px", padding:"12px 16px", color:"var(--text)", fontSize:13.5, lineHeight:1.8, whiteSpace:"pre-wrap", minHeight:48 }}>
        {msg.error
          ? <span style={{ color:"var(--error)" }}>⚠ {msg.error}</span>
          : msg.text
          ? <>{msg.text}{isStreaming && <span style={{ animation:"blink 1s infinite", marginLeft:2 }}>▍</span>}</>
          : <span style={{ color:"var(--text3)", animation:"pulse 1.2s infinite" }}>考えています...</span>
        }
      </div>
    </div>
  );
}
