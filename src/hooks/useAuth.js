import { useState, useEffect, useCallback } from "react";

const TOKEN_KEY = "ai-discussion-jwt";

function parseJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export default function useAuth() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState("free");

  useEffect(() => {
    const url = new URL(window.location.href);
    const authCode = url.searchParams.get("auth_code");
    const authError = url.searchParams.get("auth_error");

    if (authError) {
      url.searchParams.delete("auth_error");
      window.history.replaceState({}, "", url.pathname);
      setLoading(false);
      return;
    }

    // Exchange one-time code for JWT (code never contains the actual token)
    if (authCode) {
      url.searchParams.delete("auth_code");
      window.history.replaceState({}, "", url.pathname);

      fetch("/api/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: authCode }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.token) {
            const parsed = parseJWT(data.token);
            if (parsed) {
              localStorage.setItem(TOKEN_KEY, data.token);
              setToken(data.token);
              setUser(parsed);
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }

    // Check localStorage for existing token
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      const parsed = parseJWT(stored);
      if (parsed) {
        setToken(stored);
        setUser(parsed);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    setLoading(false);
  }, []);

  // Fetch current plan from server (not from JWT)
  useEffect(() => {
    if (!token) {
      setPlan("free");
      return;
    }
    fetch("/api/usage", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.plan) setPlan(data.plan);
      })
      .catch(() => {});
  }, [token]);

  const login = useCallback(() => {
    window.location.href = "/api/auth/google";
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setToken(null);
    setPlan("free");
  }, []);

  const isPremium = plan === "premium";

  return { user, token, loading, isPremium, plan, login, logout };
}
