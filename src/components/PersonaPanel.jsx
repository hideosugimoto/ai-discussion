import { MODELS, PERSONA_PRESETS, PERSONA_PACKS } from "../constants";

function PersonaCard({ model, persona, onChange }) {
  return (
    <div className="persona-card" style={{ flex:1, minWidth:180, padding:"var(--ui-pad)", background:"var(--ui-card-bg)", border:"var(--ui-card-border)", borderRadius:"var(--ui-radius)", borderTop:`3px solid ${model.color}` }}>
      <div style={{ fontSize:12, fontWeight:600, color:model.color, marginBottom:8, display:"flex", alignItems:"center", gap:4 }}>
        <span>{model.icon}</span> {model.name}
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8 }}>
        {PERSONA_PRESETS.slice(0, 6).map(({ label }) => (
          <button key={label} onClick={() => onChange(persona === label ? "" : label)}
            style={{ padding:"2px 8px", borderRadius:12, border:"1px solid var(--border)", cursor:"pointer", fontSize:10, background:persona===label?"var(--accent)":"transparent", color:persona===label?"#fff":"var(--text3)" }}>
            {label}
          </button>
        ))}
      </div>
      <input type="text" value={persona} onChange={(e) => onChange(e.target.value)} maxLength={50}
        placeholder="例: 孫正義の視点で" aria-label={`${model.name}のペルソナ`}
        style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:"var(--ui-radius-sm)", padding:"var(--ui-pad-sm)", color:"var(--text)", fontSize:12 }} />
    </div>
  );
}

export default function PersonaPanel({ personas, onChange }) {
  const handlePackSelect = (pack) => {
    const current = `${personas.claude}${personas.chatgpt}${personas.gemini}`;
    const packStr = `${pack.personas.claude}${pack.personas.chatgpt}${pack.personas.gemini}`;
    if (current === packStr) {
      onChange({ claude: "", chatgpt: "", gemini: "" });
    } else {
      onChange({ ...pack.personas });
    }
  };

  const hasAnyPersona = personas.claude || personas.chatgpt || personas.gemini;

  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
        <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"monospace", letterSpacing:"0.1em" }}>ペルソナ設定 — 各AIに役割を割り当て</span>
        {hasAnyPersona && (
          <button onClick={() => onChange({ claude:"", chatgpt:"", gemini:"" })}
            style={{ background:"none", border:"none", color:"var(--text3)", cursor:"pointer", fontSize:10 }}>クリア</button>
        )}
      </div>

      {/* Pack presets */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:8 }}>
        {PERSONA_PACKS.map((pack) => {
          const isActive = personas.claude === pack.personas.claude && personas.chatgpt === pack.personas.chatgpt && personas.gemini === pack.personas.gemini;
          return (
            <button key={pack.id} onClick={() => handlePackSelect(pack)}
              style={{ padding:"4px 10px", borderRadius:16, border:"1px solid var(--border)", cursor:"pointer", fontSize:11, fontWeight:500, background:isActive?"var(--accent)":"transparent", color:isActive?"#fff":"var(--text2)" }}>
              {pack.label}
            </button>
          );
        })}
      </div>

      {/* Per-AI cards */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {MODELS.map((model) => (
          <PersonaCard key={model.id} model={model} persona={personas[model.id] || ""}
            onChange={(val) => onChange({ ...personas, [model.id]: val })} />
        ))}
      </div>
    </div>
  );
}
