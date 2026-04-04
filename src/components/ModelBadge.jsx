export default function ModelBadge({ model, tag, size = "md" }) {
  const sm = size === "sm";
  return (
    <div style={{ display:"inline-flex", alignItems:"center", gap:5, padding:sm?"3px 8px":"5px 12px", borderRadius:20, background:model.bg, border:`1px solid ${model.dimColor}` }}>
      <span style={{ color:model.color, fontSize:sm?10:13 }}>{model.icon}</span>
      <span style={{ color:model.color, fontSize:sm?11:13, fontWeight:700 }}>{model.name}</span>
      {tag && <span style={{ color:model.color, fontSize:10, opacity:0.6 }}>{tag}</span>}
    </div>
  );
}
