import { useCallback, useState } from "react";

const API_BASE = "/api/discussions";

async function authFetch(token, path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
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
  // DELETE may return empty body
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Hook for managing cloud-synced discussions (Premium only).
// All methods are no-ops when token is null.
export default function useCloudHistory(token) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [limit, setLimit] = useState(300);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const list = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await authFetch(token, "?limit=100");
      setItems(data?.discussions || []);
      setTotal(data?.total || 0);
      setTotalBytes(data?.totalBytes || 0);
      setLimit(data?.limit || 300);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const search = useCallback(async (q, tag) => {
    if (!token) return [];
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (tag) params.set("tag", tag);
      const data = await authFetch(token, `/search?${params.toString()}`);
      return data?.results || [];
    } catch (e) {
      setError(e.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [token]);

  const upsert = useCallback(async (id, payload) => {
    if (!token || !id) return null;
    return await authFetch(token, `/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }, [token]);

  const remove = useCallback(async (id) => {
    if (!token || !id) return;
    await authFetch(token, `/${encodeURIComponent(id)}`, { method: "DELETE" });
    setItems((prev) => prev.filter((x) => x.id !== id));
    setTotal((t) => Math.max(0, t - 1));
  }, [token]);

  const fetchOne = useCallback(async (id) => {
    if (!token || !id) return null;
    return await authFetch(token, `/${encodeURIComponent(id)}`);
  }, [token]);

  const bulkUpload = useCallback(async (itemsToUpload) => {
    if (!token || !Array.isArray(itemsToUpload) || itemsToUpload.length === 0) {
      return { created: [], skipped: [] };
    }
    return await authFetch(token, "/bulk", {
      method: "POST",
      body: JSON.stringify({ items: itemsToUpload }),
    });
  }, [token]);

  return {
    items, total, totalBytes, limit, loading, error,
    list, search, upsert, remove, fetchOne, bulkUpload,
  };
}
