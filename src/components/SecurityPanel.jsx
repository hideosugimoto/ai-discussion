import Collapsible from "./Collapsible";

export default function SecurityPanel({ open, onToggle }) {
  return (
    <Collapsible label="🔒 セキュリティについて" open={open} onToggle={onToggle}>
      <div style={{ fontSize:13, color:"#e2e8f0", lineHeight:2 }}>
        <div>✅ APIキーは運営者サーバーに送信されません</div>
        <div>✅ 通信はブラウザ↔各AIのAPI間のみ（HTTPS）</div>
        <div>✅ コードはGitHubで公開・誰でも確認可能</div>
        <div>✅ SRIでCDN改ざんを検知・自動ブロック</div>
        <div style={{ color:"#f59e0b", marginTop:8 }}>⚠️ localStorageはXSSリスクがあります（デフォルトOFF推奨）</div>
        <div style={{ color:"#f59e0b" }}>⚠️ Gemini APIキーはGoogle仕様によりURLに含まれます（ネットワークログに残る可能性）</div>
        <div style={{ color:"#f59e0b" }}>⚠️ Cloudflare経由のため極めて低確率ながらCDNリスクが残ります</div>
        <div style={{ color:"#ffffff50", fontSize:12, marginLeft:20 }}>（SRIにより改ざん時はブラウザが自動ブロックします）</div>
        <div style={{ marginTop:12, fontSize:12 }}>
          <a href="https://github.com/hideosugimoto/ai-discussion" target="_blank" rel="noopener noreferrer" style={{ color:"#60a5fa" }}>最も安全な使い方：GitHubからソースを取得してローカルで実行 →</a>
        </div>
      </div>
    </Collapsible>
  );
}
