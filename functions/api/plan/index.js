// Minimal plan lookup: one primary-key read, nothing else.
//
// useAuth() only ever needed the plan, but it used to call /api/usage, which
// runs the full monthly aggregate — a scan of every usage row for the month —
// on every login, token refresh and retry. Splitting it out keeps the hot path
// to a single row read.
//
// Failure is reported as a 500, never as {plan:"free"}: the client
// distinguishes "could not read" from "is on the free plan", and collapsing
// the two is what showed subscribers the plan picker during the 2026-09-04
// D1 outage.
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestGet(context) {
  try {
    const { env, data } = context;
    const user = data.user;

    if (!user) return json(401, { error: "Not authenticated" });

    const row = await env.DB.prepare("SELECT plan FROM users WHERE id = ?")
      .bind(user.sub)
      .first();

    // No row = the account genuinely has no paid plan yet. That is a real
    // "free", unlike a thrown query.
    return json(200, { plan: row?.plan || "free" });
  } catch (e) {
    console.error("[api/plan] Error:", e?.message || e, e?.stack || "");
    return json(500, { error: "Plan query failed" });
  }
}
