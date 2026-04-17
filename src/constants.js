export const MODE_MODELS = {
  best: {
    claude:  { tag: "claude-opus-4-7",    label: "Opus 4.7" },
    chatgpt: { tag: "gpt-5.4",            label: "GPT-5.4" },
    gemini:  { tag: "gemini-2.5-pro",     label: "2.5 Pro" },
  },
  fast: {
    claude:  { tag: "claude-sonnet-4-6",  label: "Sonnet 4.6" },
    chatgpt: { tag: "gpt-5.4-mini",       label: "GPT-5.4 mini" },
    gemini:  { tag: "gemini-2.5-flash",   label: "2.5 Flash" },
  },
};

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
];

export const DISCUSSION_MODES = [
  { id: "standard",  label: "💬 標準",     description: "バランスの取れた議論" },
  { id: "debate",    label: "⚔️ ディベート", description: "対立・反論を重視" },
  { id: "brainstorm", label: "💡 ブレスト",  description: "発散・アイデア重視" },
  { id: "factcheck", label: "🔍 事実検証",  description: "根拠・正確性を重視" },
  { id: "conclusion", label: "📋 結論まとめ", description: "議論を収束・結論を導出" },
];
