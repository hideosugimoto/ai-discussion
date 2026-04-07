import { createContext, useContext, useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "ai-discussion-help-mode";

const HelpContext = createContext({ helpMode: true, toggle: () => {} });

// First-time users get help mode ON by default. Returning users keep their
// last preference.
function readInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return true;
    return saved === "1";
  } catch {
    return true;
  }
}

export function HelpProvider({ children }) {
  const [helpMode, setHelpMode] = useState(readInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, helpMode ? "1" : "0");
    } catch {
      // localStorage may be unavailable in private mode -- ignore
    }
  }, [helpMode]);

  const toggle = useCallback(() => setHelpMode((v) => !v), []);

  return (
    <HelpContext.Provider value={{ helpMode, toggle }}>
      {children}
    </HelpContext.Provider>
  );
}

export function useHelp() {
  return useContext(HelpContext);
}
