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
  { id: "claude",  name: "Claude",  color: "#f59e0b", dimColor: "#78350f", bg: "#1c1207", icon: "◆" },
  { id: "chatgpt", name: "ChatGPT", color: "#10a37f", dimColor: "#134e3f", bg: "#07120f", icon: "◉" },
  { id: "gemini",  name: "Gemini",  color: "#60a5fa", dimColor: "#1e3a5f", bg: "#070d1c", icon: "✦" },
];
