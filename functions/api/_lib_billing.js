// Shared billing helpers used by chat/stream.js and usage/index.js
//
// File name starts with "_" so Cloudflare Pages Functions skips it from
// routing. It's importable as a regular module.

export function usdToMicro(usd) {
  return Math.round(usd * 1_000_000);
}

// Resolve the BASE monthly limit (in microdollars) for a plan, before adding
// any one-time credits. Reads from env vars so values can be tuned without
// code changes.
export function basePlanLimitMicro(env, plan) {
  if (plan === "plus") {
    return usdToMicro(parseFloat(env.MONTHLY_COST_LIMIT_USD_PLUS || "5.00"));
  }
  // 'premium' (and any unknown paid plan) falls back to standard limit
  return usdToMicro(parseFloat(env.MONTHLY_COST_LIMIT_USD || "1.96"));
}

// Sum of unexpired one-time credits for the user (microdollars).
// Uses YYYY-MM-DD comparison so credits are valid through end of expiry day.
export async function getActiveCreditsMicro(db, userId) {
  const today = new Date().toISOString().slice(0, 10);
  const row = await db.prepare(
    "SELECT COALESCE(SUM(amount_micro), 0) as total FROM user_credits WHERE user_id = ? AND expires_at >= ?"
  )
    .bind(userId, today)
    .first();
  return row?.total || 0;
}

// Effective limit = base plan limit + active credits
export async function getEffectiveLimitMicro(db, env, userId, plan) {
  const base = basePlanLimitMicro(env, plan);
  const credits = await getActiveCreditsMicro(db, userId);
  return { base, credits, effective: base + credits };
}

// Compute the expiration date (YYYY-MM-DD) at the end of the current UTC month.
// Used when granting a credit purchase.
export function endOfCurrentMonth() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  // Last day of THIS month = day 0 of NEXT month
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return lastDay.toISOString().slice(0, 10);
}
