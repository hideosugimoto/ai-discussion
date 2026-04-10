import { useState, useEffect, useCallback, useRef } from "react";

const TOKEN_KEY = "ai-discussion-jwt";
const REFRESH_KEY = "ai-discussion-refresh";

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

function getJWTExpiry(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return 0;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return (payload.exp || 0) * 1000; // ms
  } catch {
    return 0;
  }
}

async function fetchPlanFromServer(token, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const hdrs = { Authorization: `Bearer ${token}` };
      console.log(`[fetchPlan] attempt ${i + 1}/${retries}, token=${token ? token.slice(0, 20) + "..." : "NULL"}, header=`, hdrs.Authorization?.slice(0, 30));
      const res = await fetch("/api/usage", { headers: hdrs });
      console.log(`[fetchPlan] response status=${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`[fetchPlan] data.plan=${data.plan}`);
        if (data.plan) return data.plan;
      }
    } catch (err) {
      console.warn(`[fetchPlan] error on attempt ${i + 1}:`, err.message);
    }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, 1500));
  }
  console.warn("[fetchPlan] all retries failed, returning 'free'");
  return "free";
}

async function refreshTokens(refreshToken) {
  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  return await res.json();
}

export default function useAuth() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [plan, setPlan] = useState("free");
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY));
  const refreshTimerRef = useRef(null);

  // Schedule auto-refresh 2 minutes before JWT expiry
  const scheduleRefresh = useCallback((jwt, refresh) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

    const expiresAt = getJWTExpiry(jwt);
    const now = Date.now();
    const refreshIn = Math.max(0, expiresAt - now - 2 * 60 * 1000); // 2 min before expiry

    refreshTimerRef.current = setTimeout(async () => {
      const result = await refreshTokens(refresh);
      if (result?.token && result?.refreshToken) {
        const parsed = parseJWT(result.token);
        if (parsed) {
          localStorage.setItem(TOKEN_KEY, result.token);
          localStorage.setItem(REFRESH_KEY, result.refreshToken);
          setToken(result.token);
          setUser(parsed);
          scheduleRefresh(result.token, result.refreshToken);
        }
      } else {
        // Refresh failed - clear session
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setUser(null);
        setToken(null);
        setPlan("free");
      }
    }, refreshIn);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const authCode = url.searchParams.get("auth_code");
    const authError = url.searchParams.get("auth_error");
    const checkoutResult = url.searchParams.get("checkout");

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

    // Exchange one-time code for JWT + refresh token
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
              if (data.refreshToken) {
                localStorage.setItem(REFRESH_KEY, data.refreshToken);
                scheduleRefresh(data.token, data.refreshToken);
              }
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }

    // Restore from localStorage
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedRefresh = localStorage.getItem(REFRESH_KEY);

    if (storedToken) {
      const parsed = parseJWT(storedToken);
      if (parsed) {
        // JWT still valid
        setToken(storedToken);
        setUser(parsed);
        if (storedRefresh) scheduleRefresh(storedToken, storedRefresh);

        if (checkoutResult === "success") {
          setPlanLoading(true);
          fetchPlanFromServer(storedToken, 5).then((p) => {
            setPlan(p);
            setPlanLoading(false);
          });
        }
      } else if (storedRefresh) {
        // JWT expired but refresh token exists - try refresh immediately
        refreshTokens(storedRefresh).then((result) => {
          if (result?.token && result?.refreshToken) {
            const p = parseJWT(result.token);
            if (p) {
              localStorage.setItem(TOKEN_KEY, result.token);
              localStorage.setItem(REFRESH_KEY, result.refreshToken);
              setToken(result.token);
              setUser(p);
              scheduleRefresh(result.token, result.refreshToken);
            }
          } else {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(REFRESH_KEY);
          }
        }).catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(REFRESH_KEY);
        }).finally(() => setLoading(false));
        return;
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    setLoading(false);

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [scheduleRefresh]);

  // Fetch current plan from server
  useEffect(() => {
    if (!token) {
      setPlan("free");
      return;
    }
    setPlanLoading(true);
    fetchPlanFromServer(token, 3).then((p) => {
      setPlan(p);
      setPlanLoading(false);
    });
  }, [token]);

  const login = useCallback(() => {
    window.location.href = "/api/auth/google";
  }, []);

  const logout = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    setUser(null);
    setToken(null);
    setPlan("free");
  }, []);

  const isPremium = plan !== "free";

  return { user, token, loading, isPremium, plan, planLoading, login, logout };
}
