import { useState, useCallback } from "react";

export default function useUsage(token) {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/usage", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setUsage(await res.json());
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [token]);

  return { usage, loading, fetchUsage };
}
