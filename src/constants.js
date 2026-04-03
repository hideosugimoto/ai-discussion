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
