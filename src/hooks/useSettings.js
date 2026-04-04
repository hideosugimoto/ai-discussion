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
    updateKey, toggleSaveKeys, updateProfile, updateConstitution, dismissProfileNotice,
    allKeysSet,
  };
}
