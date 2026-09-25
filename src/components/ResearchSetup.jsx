import HelpHint from "./HelpHint";
import { MODELS, RESEARCH_CONFIG } from "../constants";

// 調査モードを選んだときの開始前設定。
// 出しているのは2つ: レポートを書くAIの選択と、コスト・前提の開示。
// 「検索モード」の設定に関わらず毎ラウンド検索する＝通常ラウンドより高くつく、
// という挙動はユーザーが選ぶ前に分かっている必要があるので黙って始めない。
export default function ResearchSetup({ conclusionTarget, setConclusionTarget, canUseNativeSearch, isPremium }) {
  const budget = RESEARCH_CONFIG.searchBudget;
  return (
    <div style={{ marginTop:8, padding:"8px 10px", background:"var(--accent-bg)", border:"1px solid var(--accent-bd)", borderRadius:8 }}>
      <div style={{ fontSize:11, color:"var(--text3)", marginBottom:6 }}>レポート担当AI（台帳から最終レポートを書く）</div>
      <div role="radiogroup" aria-label="レポート担当AI" style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
        {MODELS.map((m) => (
          <button key={m.id} role="radio" aria-checked={conclusionTarget===m.id} onClick={() => setConclusionTarget(m.id)}
            title={`${m.name} が台帳をもとに最終レポートを作成`}
            style={{ padding:"4px 10px", border:`1px solid ${conclusionTarget===m.id?m.color:"var(--border)"}`, borderRadius:16, cursor:"pointer", fontSize:11, fontWeight:600, background:conclusionTarget===m.id?m.bg:"transparent", color:conclusionTarget===m.id?m.color:"var(--text2)" }}>
            {m.icon} {m.name}
          </button>
        ))}
      </div>
      {!canUseNativeSearch && (
        <div role="alert" style={{ marginTop:8, fontSize:11.5, color:"var(--warning)", lineHeight:1.6 }}>
          ⚠️ 現在の設定では調査モードのWeb検索が使えません（{isPremium
            ? "自分のAPIキー利用中はサーバー側の検索経路を使えません。設定でプラン経由に切り替えてください"
            : "Premiumプランが必要です"}）。このまま実行すると、AIは検索できないため台帳はほとんど埋まりません。
        </div>
      )}
      <div style={{ marginTop:8, fontSize:11, color:"var(--text3)", lineHeight:1.6 }}>
        ※ 調査モードは「検索モード」の設定に関わらず、毎ラウンド各AIが自分で検索します（1AIあたり最大{budget}回の検索＋{budget}回のページ取得）。通常の議論モードより1ラウンドの費用は高くなります。
      </div>
      <HelpHint>
        調査モードは議論をしません。1ラウンドごとに各AIが担当分をWeb検索・ページ確認し、確認できた事実だけを台帳に追記します。ラウンドを重ねて台帳が埋まったら「最終レポートを作成」を押してください
      </HelpHint>
    </div>
  );
}
