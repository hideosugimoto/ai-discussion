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

async function fetchPlanFromServer(token, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch("/api/usage", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.plan) return data.plan;
      }
    } catch {
      // retry
    }
    // Webhook may not have arrived yet, wait before retry
    if (i < retries - 1) await new Promise((r) => setTimeout(r, 1500));
  }
  return "free";
}

export default function useAuth() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState("free");
  const [planLoading, setPlanLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY));

  useEffect(() => {
    const url = new URL(window.location.href);
    const authCode = url.searchParams.get("auth_code");
    const authError = url.searchParams.get("auth_error");
    const checkoutResult = url.searchParams.get("checkout");

    // Clean up URL params
    if (authError || authCode || checkoutResult) {
      const cleanUrl = new URL(url);
      cleanUrl.searchParams.delete("auth_error");
      cleanUrl.searchParams.delete("auth_code");
      cleanUrl.searchParams.delete("checkout");
      window.history.replaceState({}, "", cleanUrl.pathname);
    }

    if (authError) {
      setLoading(false);
      return;
    }

    // Exchange one-time code for JWT (code never contains the actual token)
    if (authCode) {
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

        // After Stripe checkout, poll for plan update with retries
        if (checkoutResult === "success") {
          setPlanLoading(true);
          fetchPlanFromServer(stored, 5).then((p) => {
            setPlan(p);
            setPlanLoading(false);
          });
        }
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
    setPlanLoading(true);
    fetchPlanFromServer(token, 1).then((p) => {
      setPlan(p);
      setPlanLoading(false);
    });
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

  return { user, token, loading, isPremium, plan, planLoading, login, logout };
}
