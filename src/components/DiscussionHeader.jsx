import { MODELS, THEMES } from "../constants";
import ModelBadge from "./ModelBadge";

const MODE_OPTIONS = [
  { id:"best", label:"🧠 最強", title:"各社の最上位モデル（Opus 4.8 / GPT-5.6 Sol / 3.5 Flash）。深い洞察・複雑な論点・微妙なニュアンスに強い。消費が多め（目安 約7議論/月）。" },
  { id:"fast", label:"⚡ 高速", title:"軽量・高速モデル（Sonnet 4.6 / GPT-5.4 mini / 3.1 Flash-Lite）。日常の議論には十分な品質で、たくさん回せる（目安 約25議論/月）。" },
];

const SEARCH_OPTIONS = [
  { id:"off",    label:"🔎 検索なし", title:"Web検索を使いません" },
  { id:"shared", label:"共通",        title:"議題に関する最新情報を1回検索し、3AIに同じ事実を渡して議論させます" },
  { id:"native", label:"各AI個別",    title:"各AIが自分のWeb検索ツールで個別に調べ、別ソースを引いて議論を発達させます" },
];

const segBtn = (active) => ({ padding:"6px 12px", border:"none", cursor:"pointer", fontSize:11, fontWeight:600, background:active?"var(--accent)":"transparent", color:active?"#fff":"var(--text2)" });

// App title, the 3 model badges, and the mode / theme / web-search segmented
// toggles. Pure presentational — all state lives in App.
export default function DiscussionHeader({ cm, mode, setMode, theme, setTheme, isPremium, searchMode, setSearchMode, useOwnKeys }) {
  return (
    <div style={{ textAlign:"center", marginBottom:20, width:"100%", maxWidth:900 }}>
      <div style={{ fontSize:11, color:"var(--text3)", letterSpacing:"0.3em", marginBottom:6 }}>AI ROUNDTABLE</div>
      <h1 style={{ margin:"0 0 14px", fontSize:22, fontWeight:700, color:"var(--text)", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="28" height="28" style={{ flexShrink:0 }}>
          <rect width="64" height="64" rx="14" fill="#161627"/>
          <circle cx="32" cy="22" r="14" fill="#E8815C" opacity="0.85" style={{ mixBlendMode:"screen" }}/>
          <circle cx="22" cy="40" r="14" fill="#10A37F" opacity="0.85" style={{ mixBlendMode:"screen" }}/>
          <circle cx="42" cy="40" r="14" fill="#4285F4" opacity="0.85" style={{ mixBlendMode:"screen" }}/>
          <circle cx="32" cy="34" r="4" fill="#fff" opacity="0.9"/>
        </svg>
        3 AI Discussion
      </h1>
      <div style={{ display:"flex", justifyContent:"center", gap:8, flexWrap:"wrap", marginBottom:12 }}>
        {MODELS.map((m) => <ModelBadge key={m.id} model={m} tag={cm[m.id].label} />)}
      </div>
      <div style={{ display:"flex", justifyContent:"center", gap:8, flexWrap:"wrap" }}>
        <div role="radiogroup" aria-label="モード選択" style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
          {MODE_OPTIONS.map(({ id, label, title }) => (
            <button key={id} role="radio" aria-checked={mode===id} title={title} onClick={() => setMode(id)} style={segBtn(mode===id)}>{label}</button>
          ))}
        </div>
        <div role="radiogroup" aria-label="テーマ選択" style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
          {THEMES.map(({ id, label }) => (
            <button key={id} role="radio" aria-checked={theme===id} onClick={() => setTheme(id)} style={segBtn(theme===id)}>{label}</button>
          ))}
        </div>
        {isPremium && (
          <div role="radiogroup" aria-label="Web検索モード" title={useOwnKeys ? "「自分のキーを優先」がON中はWeb検索は使えません（検索は運営側機能のため）" : undefined} style={{ display:"flex", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", opacity:useOwnKeys?0.45:1 }}>
            {SEARCH_OPTIONS.map(({ id, label, title }) => (
              <button key={id} role="radio" aria-checked={searchMode===id} title={useOwnKeys ? "自分のキー使用中はWeb検索は無効です" : title}
                disabled={useOwnKeys} onClick={() => setSearchMode(id)}
                style={{ ...segBtn(searchMode===id), cursor:useOwnKeys?"not-allowed":"pointer" }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mode-hint-line" style={{ textAlign:"center", fontSize:11, color:"var(--text3)", marginTop:6, maxWidth:560, marginLeft:"auto", marginRight:"auto" }}>
        {mode === "best"
          ? "🧠 最強：各社の最上位モデルで深く議論（複雑な論点・微妙な判断に強い）。消費は多めで目安 約7議論/月。"
          : "⚡ 高速：軽量モデルで十分な品質。たくさん回せて目安 約25議論/月。じっくり深めたい時だけ「最強」を選んでください。"}
      </div>
    </div>
  );
}
