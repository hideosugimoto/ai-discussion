import { useState } from "react";
import { encryptSettings, decryptSettings } from "../crypto";

export default function useCryptoBackup({ keys, profile, saveKeys, setKeys, setProfile, persistSettings, onDone }) {
  const [exportPw, setExportPw]   = useState("");
  const [importPw, setImportPw]   = useState("");
  const [importText, setImportText] = useState("");
  const [exportText, setExportText] = useState("");
  const [cryptoMsg, setCryptoMsg] = useState("");

  const handleExport = async () => {
    if (!exportPw) { setCryptoMsg("❌ パスワードを入力してください"); setTimeout(() => setCryptoMsg(""), 2000); return; }
    try {
      const data = JSON.stringify({ keys, profile });
      const enc  = await encryptSettings(data, exportPw);
      setExportText(enc);
      await navigator.clipboard.writeText(enc).catch(() => {});
      setExportPw("");
      setCryptoMsg("✓ コピーしました（メモアプリに保存してください）");
      setTimeout(() => setCryptoMsg(""), 4000);
    } catch (e) {
      setCryptoMsg(`❌ 暗号化失敗: ${e.message}`);
      setTimeout(() => setCryptoMsg(""), 3000);
    }
  };

  const handleImport = async () => {
    if (!importPw || !importText.trim()) { setCryptoMsg("❌ パスワードとテキストを入力してください"); setTimeout(() => setCryptoMsg(""), 2000); return; }
    try {
      const raw    = await decryptSettings(importText.trim(), importPw);
      const result = JSON.parse(raw);
      if (typeof result !== "object" || result === null) throw new Error("Invalid data");
      const validKeys = {};
      if (result.keys && typeof result.keys === "object") {
        for (const id of ["claude", "chatgpt", "gemini"]) {
          validKeys[id] = typeof result.keys[id] === "string" ? result.keys[id] : "";
        }
      }
      const validProfile = typeof result.profile === "string" ? result.profile.slice(0, 10000) : "";
      setKeys((prev) => ({ ...prev, ...validKeys }));
      if (validProfile) setProfile(validProfile);
      if (saveKeys) persistSettings({ keys:{ ...keys, ...validKeys }, saveKeys, profile:validProfile||profile });
      setCryptoMsg("✓ 復元完了！");
      setImportText("");
      setImportPw("");
      setTimeout(() => { setCryptoMsg(""); if (onDone) onDone(); }, 1500);
    } catch {
      setCryptoMsg("❌ 復元失敗（パスワードが違うか、テキストが壊れています）");
      setTimeout(() => setCryptoMsg(""), 3000);
    }
  };

  return {
    exportPw, setExportPw, importPw, setImportPw,
    importText, setImportText, exportText, cryptoMsg,
    handleExport, handleImport,
  };
}
