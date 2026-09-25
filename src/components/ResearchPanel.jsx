import Markdown from "./Markdown";
import HelpHint from "./HelpHint";
import { MODELS } from "../constants";
import { ledgerStats } from "../research/ledger";

// 調査モードの作業台。3AIが集めた確定事実を1つの台帳として見せ、そこから
// 最終レポートを作る。議論モードのパネル（合意/対立）と違い、ここで意味を持つのは
// 「何がどこまで裏取りできたか」なので、対象×項目と出典を素のまま並べる。

const CONF_STYLE = {
  確実:   { color: "var(--success)", bg: "var(--success-bg)" },
  要確認: { color: "var(--warning)", bg: "var(--warning-bg)" },
  推測:   { color: "var(--text3)",   bg: "var(--bg)" },
};

const nameOf = (id) => MODELS.find((m) => m.id === id)?.name ?? id;

function ConfChip({ value }) {
  const s = CONF_STYLE[value] || CONF_STYLE.要確認;
  return (
    <span style={{ fontSize:10, fontWeight:700, color:s.color, background:s.bg, borderRadius:4, padding:"1px 5px", whiteSpace:"nowrap" }}>
      {value}
    </span>
  );
}

function PlanList({ plan }) {
  if (!plan?.items?.length) return null;
  return (
    <details style={{ marginBottom:10 }}>
      <summary style={{ cursor:"pointer", fontSize:12, fontWeight:600, color:"var(--text2)" }}>
        調査計画と分担（{plan.items.length}項目{plan.fallback ? " · 自動分割" : ""}）
      </summary>
      <ul style={{ margin:"8px 0 0", paddingLeft:18, fontSize:12, color:"var(--text2)", lineHeight:1.7 }}>
        {plan.items.map((it) => (
          <li key={it.id}>
            <span style={{ fontFamily:"monospace", color:"var(--text3)" }}>[{it.id}]</span>{" "}
            <span style={{ fontWeight:600 }}>{nameOf(it.owner)}</span>: {it.label}
          </li>
        ))}
      </ul>
    </details>
  );
}

function LedgerTable({ ledger }) {
  const targets = [...new Set(ledger.map((e) => e.target))];
  return (
    <div style={{ overflowX:"auto" }}>
      {targets.map((target) => (
        <div key={target} style={{ marginBottom:10 }}>
          <div style={{ fontSize:12.5, fontWeight:700, color:"var(--text)", marginBottom:3 }}>{target}</div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <tbody>
              {ledger.filter((e) => e.target === target).map((e, i) => (
                <tr key={`${e.field}-${e.value}-${i}`} style={{ borderTop:"1px solid var(--border)" }}>
                  <td style={{ padding:"4px 8px 4px 0", color:"var(--text3)", whiteSpace:"nowrap", verticalAlign:"top" }}>
                    {e.conflict && <span title="他AIと値が食い違っています">⚠️ </span>}{e.field}
                  </td>
                  <td style={{ padding:"4px 8px 4px 0", color:"var(--text)", verticalAlign:"top" }}>{e.value}</td>
                  <td style={{ padding:"4px 8px 4px 0", verticalAlign:"top" }}><ConfChip value={e.confidence} /></td>
                  <td style={{ padding:"4px 0", verticalAlign:"top", maxWidth:180, overflow:"hidden", textOverflow:"ellipsis" }}>
                    {e.url
                      ? <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:"var(--accent-light)" }}>出典</a>
                      : <span style={{ fontSize:11, color:"var(--text3)" }}>出典なし</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export default function ResearchPanel({ research, running, helpMode }) {
  const { plan, ledger, openItems, report, reportLoading, generateReport } = research || {};
  const entries = Array.isArray(ledger) ? ledger : [];
  const stats = ledgerStats(entries);
  const canReport = entries.length > 0 && !running && !reportLoading;

  return (
    <div style={{ marginBottom:20, padding:"12px 14px", background:"var(--surface)", border:"1px solid var(--accent-bd)", borderRadius:10 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>🔬 調査台帳</span>
        <span style={{ fontSize:11, color:"var(--text3)", fontFamily:"monospace" }}>
          対象{stats.targets} · 事実{stats.entries} · 確実{stats.confirmed}
          {stats.conflicts > 0 && ` · ⚠️矛盾${stats.conflicts}`}
        </span>
      </div>

      {helpMode && (
        <HelpHint>
          3AIが分担して集めた事実がここに積み上がります。ラウンドをまたいで消えないので、回数を重ねるほど埋まります。揃ってきたら「最終レポートを作成」で1本の成果物にまとめます。
        </HelpHint>
      )}

      <PlanList plan={plan} />

      {entries.length === 0
        ? <div style={{ fontSize:12, color:"var(--text3)", padding:"6px 0" }}>まだ確定した事実はありません。ラウンドを実行してください。</div>
        : <LedgerTable ledger={entries} />}

      {openItems?.length > 0 && (
        <details style={{ marginTop:10 }}>
          <summary style={{ cursor:"pointer", fontSize:12, fontWeight:600, color:"var(--warning)" }}>
            未確認として申告された項目（{openItems.length}）
          </summary>
          <ul style={{ margin:"6px 0 0", paddingLeft:18, fontSize:12, color:"var(--text2)", lineHeight:1.7 }}>
            {openItems.map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        </details>
      )}

      <div style={{ marginTop:12, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
        <button
          onClick={generateReport}
          disabled={!canReport}
          title="台帳にある事実だけを根拠に、議題が指定した形式で最終レポートを作成します（このとき検索はしません）"
          style={{ background:canReport?"var(--accent)":"transparent", border:"1px solid var(--accent-bd)", borderRadius:20, padding:"7px 18px", color:canReport?"#fff":"var(--text3)", cursor:canReport?"pointer":"not-allowed", fontSize:12.5, fontWeight:600 }}>
          {reportLoading ? "作成中…" : "📄 最終レポートを作成"}
        </button>
        <span style={{ fontSize:11, color:"var(--text3)" }}>台帳にない事実は書かれません（不足は「未確認」として列挙されます）</span>
      </div>

      {report && (
        <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid var(--border)" }}>
          <Markdown text={report} />
        </div>
      )}
    </div>
  );
}
