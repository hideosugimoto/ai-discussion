export default function Collapsible({ label, badge, hint, open, onToggle, children }) {
  return (
    <div style={{ marginBottom:10 }}>
      <button onClick={onToggle} aria-expanded={open} style={{ background:"none", border:"1px solid var(--border)", borderRadius:8, padding:"7px 14px", color: badge ? "var(--success)" : "var(--text2)", cursor:"pointer", fontSize:12, fontFamily:"monospace", display:"flex", alignItems:"center", gap:8 }}>
        <span>{open?"▾":"▸"}</span>
        <span>{label}</span>
        {badge && <span style={{ color:"var(--success)", fontSize:11 }}>{badge}</span>}
        {hint && <span style={{ color:"var(--error)", fontSize:11 }}>{hint}</span>}
      </button>
      {open && (
        <div style={{ marginTop:8, padding:14, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10 }}>
          {children}
        </div>
      )}
    </div>
  );
}
