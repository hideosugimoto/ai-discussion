import { useState } from "react";
import { validateClaude, validateChatGPT, validateGemini } from "../api";

export default function useKeyValidation() {
  const [status, setStatus] = useState({});
  const validate = async (id, apiKey) => {
    if (!apiKey.trim() || status[id] === "checking") return;
    setStatus((s) => ({ ...s, [id]: "checking" }));
    try {
      if (id === "claude")  await validateClaude(apiKey);
      if (id === "chatgpt") await validateChatGPT(apiKey);
      if (id === "gemini")  await validateGemini(apiKey);
      setStatus((s) => ({ ...s, [id]: "ok" }));
    } catch (e) {
      setStatus((s) => ({ ...s, [id]: `error: ${e.message}` }));
    }
  };
  return { status, validate };
}
