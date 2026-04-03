export default function Collapsible({ label, badge, hint, open, onToggle, children }) {
  return (
    <div style={{ marginBottom:10 }}>
      <button onClick={onToggle} aria-expanded={open} style={{ background:"none", border:"1px solid #2a2a3a", borderRadius:8, padding:"7px 14px", color:badge?"#4ade8090":"#ffffff50", cursor:"pointer", fontSize:12, fontFamily:"monospace", display:"flex", alignItems:"center", gap:8 }}>
        <span>{open?"▾":"▸"}</span>
        <span>{label}</span>
        {badge && <span style={{ color:"#4ade80", fontSize:11 }}>{badge}</span>}
        {hint && <span style={{ color:"#ff6b6b80", fontSize:11 }}>{hint}</span>}
      </button>
      {open && (
        <div style={{ marginTop:8, padding:14, background:"#10101a", border:"1px solid #2a2a3a", borderRadius:10 }}>
          {children}
        </div>
      )}
    </div>
  );
}
