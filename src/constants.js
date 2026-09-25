// Re-exported from the single source of truth (src/models.config.js) so
// existing `from "./constants"` imports keep working without churn.
export { MODE_MODELS, modeModelSummary, labelFor } from "./models.config";

export const MODELS = [
  { id: "claude",  name: "Claude",  color: "var(--claude-color)",  dimColor: "var(--claude-bd)",  bg: "var(--claude-bg)",  icon: "◆" },
  { id: "chatgpt", name: "ChatGPT", color: "var(--chatgpt-color)", dimColor: "var(--chatgpt-bd)", bg: "var(--chatgpt-bg)", icon: "◉" },
  { id: "gemini",  name: "Gemini",  color: "var(--gemini-color)",  dimColor: "var(--gemini-bd)",  bg: "var(--gemini-bg)",  icon: "✦" },
];

export const THEMES = [
  { id: "dark",      label: "🌙 Dark" },
  { id: "base",      label: "☀️ Base" },
  { id: "feminine",  label: "🌸 Feminine" },
];

export const PERSONA_PRESETS = [
  // 思考スタイル（汎用・どんな議題にも使える）
  { id: "optimist",  label: "楽観主義者" },
  { id: "cautious",  label: "慎重派" },
  { id: "critic",    label: "批評家" },
  { id: "realist",   label: "現実主義者" },
  // 立場
  { id: "beginner",  label: "初心者" },
  { id: "expert",    label: "専門家" },
  { id: "insider",   label: "当事者" },
  { id: "outsider",  label: "第三者" },
  // 職業（自由入力のヒント）
  { id: "executive", label: "経営者" },
  { id: "researcher", label: "研究者" },
  { id: "educator",  label: "教育者" },
  { id: "creator",   label: "クリエイター" },
];

export const PERSONA_PACKS = [
  { id: "executive",  label: "🏢 経営会議",     personas: { claude: "CEO", chatgpt: "CFO", gemini: "マーケティング責任者" } },
  { id: "investment", label: "💰 投資判断",     personas: { claude: "ベンチャーキャピタリスト", chatgpt: "慎重な個人投資家", gemini: "スタートアップ創業者" } },
  { id: "product",    label: "🎯 商品企画",     personas: { claude: "プロダクトマネージャー", chatgpt: "UXデザイナー", gemini: "エンドユーザー代表" } },
  { id: "generation", label: "👥 世代間対話",   personas: { claude: "60代経営者", chatgpt: "30代ミドル", gemini: "20代Z世代" } },
  { id: "global",     label: "🌍 グローバル",   personas: { claude: "シリコンバレーのテック企業幹部", chatgpt: "日本の中小企業経営者", gemini: "東南アジアのスタートアップ創業者" } },
  { id: "legal",      label: "⚖️ 法務・コンプラ", personas: { claude: "弁護士", chatgpt: "法務責任者", gemini: "リスク管理担当者" } },
  { id: "academic",   label: "🎓 学術討論",     personas: { claude: "大学教授", chatgpt: "若手研究者", gemini: "大学院生" } },
  { id: "media",      label: "📰 メディア視点", personas: { claude: "大手新聞記者", chatgpt: "フリーライター", gemini: "一般読者" } },
  { id: "medical",    label: "🏥 医療判断",     personas: { claude: "専門医", chatgpt: "総合診療医", gemini: "患者代表" } },
  { id: "engineering", label: "🛠 開発チーム",   personas: { claude: "経験豊富なアーキテクト", chatgpt: "フルスタックエンジニア", gemini: "プロダクトオーナー" } },
  { id: "creative",   label: "🎬 クリエイティブ", personas: { claude: "映画監督", chatgpt: "脚本家", gemini: "プロデューサー" } },
  { id: "philosophy", label: "🧠 思想家トリオ", personas: { claude: "楽観主義の哲学者", chatgpt: "懐疑的な哲学者", gemini: "実用主義の哲学者" } },
  { id: "devil",      label: "😈 逆張り（悪魔の代弁者）", personas: { claude: "提案を擁護する推進派", chatgpt: "あえて全力で反対する悪魔の代弁者", gemini: "両者を検証する中立の審判" } },
];

// One-tap intervention templates: the user is the conductor — steer the next
// round in a single tap instead of typing every time.
export const INTERVENTION_QUICKFILLS = [
  "もっと具体的に（数値・固有名詞を）",
  "反論を強めに（弱点を突いて）",
  "逆張りの視点を加えて",
  "コスト・リスク面を深掘り",
  "実行手順に落として",
  "結論を1つに絞って",
];

export const DISCUSSION_MODES = [
  { id: "standard",  label: "💬 標準",     description: "バランスの取れた議論" },
  { id: "debate",    label: "⚔️ ディベート", description: "対立・反論を重視" },
  { id: "brainstorm", label: "💡 ブレスト",  description: "発散・アイデア重視" },
  { id: "factcheck", label: "🔍 事実検証",  description: "根拠・正確性を重視" },
  { id: "consensus", label: "🤝 合意形成",  description: "対立を歩み寄り・第三案で合意へ" },
  { id: "decision",  label: "⚖️ 意思決定",  description: "選択肢を評価軸で比較し推奨を出す" },
  { id: "research",  label: "🔬 調査",     description: "3AIが分担してWeb調査・事実を台帳に蓄積しレポート化（要Premium）" },
  { id: "conclusion", label: "🧾 中立まとめ", description: "1AIが合意/相違/結論に中立整理（裁定なし）" },
];

// 調査モードの実行パラメータ。検索・取得の回数と出力上限はそのままコストなので、
// 1か所に集約して「どこを緩めるといくら増えるか」を追えるようにしておく。
export const RESEARCH_CONFIG = {
  // 1ターン・1AIあたりの検索回数とページ取得回数。サーバ側で1〜5にクランプされる。
  // 検索は1回$0.01（Anthropic/OpenAI）、web_fetchは従量課金なしでトークン分のみ。
  // 3→2: 実測で調査1回（2ラウンド＋レポート）が$0.46、Premiumの月次枠$3では
  // 6回しか回らなかった。検索回数は検索料とツール結果の取り込みトークンの両方に
  // 効くので、ここが最も効く削減点。ラウンドあたりの進みは落ちるので、必要
  // ラウンド数が増えて相殺されないかは実使用で要観測。
  searchBudget: 2,
  // web_fetch1回あたりの取り込みトークン上限。ページ全文は数万トークンになるため必須。
  fetchContentTokens: 6000,
  // 調査ラウンドの出力上限。本文＋台帳行がツール呼び出しと同じ出力枠を共有するので、
  // 通常ラウンド（1500）では台帳が途中で切れる。
  roundMaxTokens: 3000,
  // 最終レポートの出力上限。表を含む成果物1本分。
  reportMaxTokens: 8000,
};
