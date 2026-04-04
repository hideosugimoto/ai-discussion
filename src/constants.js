export const MODE_MODELS = {
  best: {
    claude:  { tag: "claude-opus-4-6",    label: "Opus 4.6" },
    chatgpt: { tag: "gpt-4o",             label: "GPT-4o" },
    gemini:  { tag: "gemini-2.5-pro",     label: "2.5 Pro" },
  },
  fast: {
    claude:  { tag: "claude-sonnet-4-6",  label: "Sonnet 4.6" },
    chatgpt: { tag: "gpt-4o-mini",        label: "GPT-4o mini" },
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

export const UI_MODES = [
  { id: "structure",  label: "構造優先",  icon: "▦", description: "迷わないUI — 正確性・理解を優先" },
  { id: "action",     label: "操作最適",  icon: "⚡", description: "最短操作UI — スピードを優先" },
  { id: "experience", label: "体験重視",  icon: "✧", description: "気持ちよいUI — 満足度を優先" },
];

export const PERSONA_PRESETS = [
  { id: "ceo",        label: "CEO" },
  { id: "investor",   label: "投資家" },
  { id: "marketer",   label: "マーケター" },
  { id: "cfo",        label: "CFO" },
  { id: "engineer",   label: "シニアエンジニア" },
  { id: "researcher", label: "AI研究者" },
  { id: "cto",        label: "スタートアップCTO" },
  { id: "student",    label: "大学生" },
  { id: "freelance",  label: "フリーランス" },
  { id: "critic",     label: "批評家" },
  { id: "optimist",   label: "楽観主義者" },
  { id: "cautious",   label: "慎重派" },
];

export const PERSONA_PACKS = [
  { id: "executive",  label: "🏢 経営会議",   personas: { claude: "CEO", chatgpt: "CFO", gemini: "マーケティング責任者" } },
  { id: "investment", label: "💰 投資判断",   personas: { claude: "ベンチャーキャピタリスト", chatgpt: "慎重な個人投資家", gemini: "スタートアップ創業者" } },
  { id: "product",    label: "🎯 商品企画",   personas: { claude: "プロダクトマネージャー", chatgpt: "UXデザイナー", gemini: "エンドユーザー代表" } },
  { id: "generation", label: "👥 世代間対話", personas: { claude: "60代経営者", chatgpt: "30代ミドル", gemini: "20代Z世代" } },
  { id: "global",     label: "🌍 グローバル", personas: { claude: "シリコンバレーのテック企業幹部", chatgpt: "日本の中小企業経営者", gemini: "東南アジアのスタートアップ創業者" } },
];

export const DISCUSSION_MODES = [
  { id: "standard",  label: "💬 標準",     description: "バランスの取れた議論" },
  { id: "debate",    label: "⚔️ ディベート", description: "対立・反論を重視" },
  { id: "brainstorm", label: "💡 ブレスト",  description: "発散・アイデア重視" },
  { id: "factcheck", label: "🔍 事実検証",  description: "根拠・正確性を重視" },
];
