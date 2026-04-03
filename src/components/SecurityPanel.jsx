export default function SecurityPanel() {
  return (
    <div style={{ padding:14, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10 }}>
      <div style={{ fontSize:13, color:"var(--text)", lineHeight:2 }}>
        <div>✅ APIキーは運営者サーバーに送信されません</div>
        <div>✅ 通信はブラウザ↔各AIのAPI間のみ（HTTPS）</div>
        <div>✅ コードはGitHubで公開・誰でも確認可能</div>
        <div>✅ SRIでCDN改ざんを検知・自動ブロック</div>
        <div style={{ color:"var(--warning)", marginTop:8 }}>⚠️ localStorageはXSSリスクがあります（デフォルトOFF推奨）</div>
        <div style={{ color:"var(--warning)" }}>⚠️ Gemini APIキーはGoogle仕様によりURLに含まれます（ネットワークログに残る可能性）</div>
        <div style={{ color:"var(--warning)" }}>⚠️ Cloudflare経由のため極めて低確率ながらCDNリスクが残ります</div>
        <div style={{ color:"var(--text2)", fontSize:12, marginLeft:20 }}>（SRIにより改ざん時はブラウザが自動ブロックします）</div>
        <div style={{ marginTop:12, fontSize:12 }}>
          <a href="https://github.com/hideosugimoto/ai-discussion" target="_blank" rel="noopener noreferrer" style={{ color:"var(--link)" }}>最も安全な使い方：GitHubからソースを取得してローカルで実行 →</a>
        </div>
      </div>
    </div>
  );
}
