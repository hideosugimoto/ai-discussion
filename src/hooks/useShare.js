import { useCallback, useState } from "react";

const API_BASE = "/api/share";

async function authFetch(token, path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
      if (data?.message) msg += ` — ${data.message}`;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Hook for managing share links (Premium only).
// Methods are no-ops when token is null.
export default function useShare(token) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const list = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await authFetch(token, "");
      setShares(data?.shares || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const create = useCallback(async (topic, dataJson) => {
    if (!token) throw new Error("ログインが必要です");
    return await authFetch(token, "", {
      method: "POST",
      body: JSON.stringify({ topic, data_json: dataJson }),
    });
  }, [token]);

  const remove = useCallback(async (id) => {
    if (!token) return;
    await authFetch(token, `/${encodeURIComponent(id)}`, { method: "DELETE" });
    setShares((prev) => prev.filter((s) => s.id !== id));
  }, [token]);

  return { shares, loading, error, list, create, remove };
}

// Standalone helper for fetching a public shared discussion (no auth).
export async function fetchSharedDiscussion(shareId) {
  if (!shareId || typeof shareId !== "string") return null;
  const res = await fetch(`${API_BASE}/${encodeURIComponent(shareId)}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("共有が見つかりません");
    if (res.status === 410) throw new Error("この共有は期限切れです");
    throw new Error(`取得に失敗しました (${res.status})`);
  }
  return await res.json();
}
