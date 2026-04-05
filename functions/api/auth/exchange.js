// Exchange one-time auth code for JWT + refresh token
export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const code = body?.code;
  if (!code || typeof code !== "string" || code.length > 50) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid auth code" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!env.KV) {
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const stored = await env.KV.get(`auth_code:${code}`);
  if (!stored) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired code" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Delete immediately (one-time use)
  await env.KV.delete(`auth_code:${code}`);

  // Parse stored data (may be JSON with refreshToken, or plain JWT for backwards compat)
  let token;
  let refreshToken;
  try {
    const parsed = JSON.parse(stored);
    token = parsed.token;
    refreshToken = parsed.refreshToken;
  } catch {
    token = stored;
    refreshToken = null;
  }

  return new Response(
    JSON.stringify({ token, refreshToken }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
