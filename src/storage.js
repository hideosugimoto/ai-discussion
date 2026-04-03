const LS_KEY = "ai-discussion-settings";

export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}

export function saveSettings(obj) {
  try {
    const prev = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    const next = { ...obj };
    if ("profile" in next) {
      if (next.profile !== prev.profile) {
        next.profileUpdatedAt = new Date().toISOString();
      } else if (prev.profileUpdatedAt) {
        next.profileUpdatedAt = prev.profileUpdatedAt;
      }
    }
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {}
}

export function clearSettings() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}
