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

// Resolves to { plan } on success, or { error: true } when the plan could not
// be read at all. Never resolves to a plan value on failure: a server-side
// outage (e.g. the D1 daily-read limit) must not be reported as "free", or a
// paying user is shown the upgrade/plan-picker screen as though unsubscribed.
async function fetchPlanFromServer(token, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch("/api/usage", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.plan) return { plan: data.plan };
      }
    } catch {
      // retry
    }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, 1500));
  }
  return { error: true };
}

// Exported for tests. `plan === null` means "not determined yet / failed to
// read", which is deliberately distinct from the "free" plan.
export function planStateFrom(result) {
  if (!result || result.error || !result.plan) return { plan: null, planError: true };
  return { plan: result.plan, planError: false };
}

// Premium requires a *known* paid plan. An undetermined plan is never premium
// (the server re-checks the plan on every billable call anyway, so this only
// governs what the UI offers).
export function isPremiumPlan(plan) {
  return plan != null && plan !== "free";
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
  // True when the plan could not be read from the server. The UI must not
  // offer a plan/upgrade screen in this state — we don't know what they have.
  const [planError, setPlanError] = useState(false);
  // Set when the OAuth callback bounced back with ?auth_error=...
  const [authError, setAuthError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY));
  // Bumped by retryPlan() to re-run the plan fetch effect.
  const [planReloadKey, setPlanReloadKey] = useState(0);
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
        setPlanError(false);
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
      setAuthError(authError);
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
          // Right after checkout the plan row may lag the webhook, so retry
          // more times here than on a normal load.
          fetchPlanFromServer(storedToken, 5).then((result) => {
            const next = planStateFrom(result);
            setPlan(next.plan);
            setPlanError(next.planError);
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
      // Signed out: "free" is the truth here, not a failed read. Clear the
      // loading flag too — the UI hides the onboarding card while it is set,
      // so leaving it on after a sign-out would blank the login prompt.
      setPlan("free");
      setPlanError(false);
      setPlanLoading(false);
      return;
    }
    // An in-flight fetch outlives a sign-out (or a token change). Without this
    // guard its late response would re-apply the *previous* account's plan.
    let cancelled = false;
    setPlanLoading(true);
    setPlanError(false);
    fetchPlanFromServer(token, 3).then((result) => {
      if (cancelled) return;
      const next = planStateFrom(result);
      setPlan(next.plan);
      setPlanError(next.planError);
      setPlanLoading(false);
    });
    return () => { cancelled = true; };
  }, [token, planReloadKey]);

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
    setPlanError(false);
  }, []);

  // Re-run the plan fetch after a failed read (the "再試行" button).
  const retryPlan = useCallback(() => setPlanReloadKey((k) => k + 1), []);

  const dismissAuthError = useCallback(() => setAuthError(null), []);

  const isPremium = isPremiumPlan(plan);

  return {
    user, token, loading, isPremium, plan, planLoading, planError,
    authError, dismissAuthError, retryPlan, login, logout,
  };
}
