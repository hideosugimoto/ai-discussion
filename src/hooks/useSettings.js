import { useState, useEffect } from "react";
import { loadSettings, saveSettings } from "../storage";

export default function useSettings() {
  const [saved] = useState(() => loadSettings());

  const [keys, setKeys]         = useState({ claude:"", chatgpt:"", gemini:"", ...saved.keys });
  const [saveKeys, setSaveKeys] = useState(saved.saveKeys ?? false);
  const [profile, setProfile]   = useState(saved.profile ?? "");
  const [profileUpdatedAt]      = useState(saved.profileUpdatedAt ?? null);
  const [profileNotice, setProfileNotice] = useState(false);
  const [constitution, setConstitution] = useState(saved.constitution ?? "");

  // Web search mode (premium feature): "off" | "shared" | "native". Persisted
  // independently of saveKeys so the preference survives reloads regardless of
  // key-saving choice. Default "off". Migrates the legacy boolean flag
  // (search-enabled === "1") to "shared".
  const [searchMode, setSearchModeState] = useState(() => {
    try {
      const m = localStorage.getItem("search-mode");
      if (m === "off" || m === "shared" || m === "native") return m;
      return localStorage.getItem("search-enabled") === "1" ? "shared" : "off";
    } catch { return "off"; }
  });
  const setSearchMode = (val) => {
    const m = (val === "shared" || val === "native") ? val : "off";
    setSearchModeState(m);
    try { localStorage.setItem("search-mode", m); } catch { /* ignore */ }
  };

  // Premium users can opt to use their OWN API keys instead of the plan's
  // server-side proxy, so the discussion doesn't consume their monthly plan
  // budget. Only takes effect when all three keys are set (see App.jsx).
  // Persisted independently so the preference survives reloads.
  const [preferOwnKeys, setPreferOwnKeysState] = useState(() => {
    try { return localStorage.getItem("prefer-own-keys") === "1"; } catch { return false; }
  });
  const setPreferOwnKeys = (val) => {
    setPreferOwnKeysState(!!val);
    try { localStorage.setItem("prefer-own-keys", val ? "1" : "0"); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (profile.trim() && profileUpdatedAt && !sessionStorage.getItem("profile-notice-dismissed")) {
      const days = Math.floor((Date.now() - new Date(profileUpdatedAt)) / (1000 * 60 * 60 * 24));
      if (days >= 30) setProfileNotice(days);
    }
  }, [profile, profileUpdatedAt]);

  const updateKey = (id, val) => {
    const next = { ...keys, [id]:val };
    setKeys(next);
    if (saveKeys) saveSettings({ keys:next, saveKeys, profile, constitution });
  };

  const toggleSaveKeys = (val) => {
    setSaveKeys(val);
    if (val) {
      saveSettings({ keys, saveKeys:true, profile, constitution });
    } else {
      saveSettings({ keys:{}, saveKeys:false, profile, constitution });
    }
  };

  const updateProfile = (val) => {
    setProfile(val);
    if (saveKeys) saveSettings({ keys, saveKeys, profile:val, constitution });
  };

  const updateConstitution = (val) => {
    setConstitution(val);
    if (saveKeys) saveSettings({ keys, saveKeys, profile, constitution:val });
  };

  const dismissProfileNotice = () => {
    setProfileNotice(false);
    sessionStorage.setItem("profile-notice-dismissed", "1");
  };

  const allKeysSet = !!(keys.claude && keys.chatgpt && keys.gemini);

  return {
    keys, saveKeys, profile, profileUpdatedAt, profileNotice, constitution,
    searchMode, setSearchMode,
    preferOwnKeys, setPreferOwnKeys,
    updateKey, toggleSaveKeys, updateProfile, updateConstitution, dismissProfileNotice,
    allKeysSet,
  };
}
