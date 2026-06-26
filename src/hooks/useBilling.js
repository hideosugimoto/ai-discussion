import { useEffect, useCallback } from "react";

// Stripe checkout / credit purchase flows + the post-redirect usage refetch.
// Extracted from App so the billing concern lives in one place.
export default function useBilling({ token, isPremium, fetchUsage }) {
  const startCheckout = useCallback(async (targetPlan) => {
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: targetPlan }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      alert("決済ページの取得に失敗しました。再度お試しください。");
    }
  }, [token]);

  const startCreditPurchase = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let msg = "クレジット購入ページの取得に失敗しました。";
        try {
          const d = await res.json();
          if (d?.error) msg = d.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (e) {
      alert(e.message || "クレジット購入の開始に失敗しました。");
    }
  }, [token]);

  // Refetch usage after a credit-purchase success redirect. URL cleanup is
  // unconditional so the param doesn't linger across sessions (e.g. if the user
  // logged out before redirect completed).
  useEffect(() => {
    const url = new URL(window.location.href);
    const creditStatus = url.searchParams.get("credit");
    if (creditStatus) {
      url.searchParams.delete("credit");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
    if (creditStatus === "success" && isPremium) {
      setTimeout(() => fetchUsage(), 1500); // slight delay so webhook can land
    }
  }, [isPremium, fetchUsage]);

  return { startCheckout, startCreditPurchase };
}
