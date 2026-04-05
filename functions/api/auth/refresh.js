// Refresh token endpoint - validates refresh token, issues new JWT + rotated refresh token

async function signJWT(payload, secret) {
  const encoder = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: now,
    exp: now + 15 * 60, // 15 minutes
  };

  const body = btoa(JSON.stringify(claims))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${data}.${signature}`;
}

async function hashToken(token) {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

  const refreshToken = body?.refreshToken;
  if (!refreshToken || typeof refreshToken !== "string") {
    return new Response(
      JSON.stringify({ error: "Missing refresh token" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const tokenHash = await hashToken(refreshToken);

  // Find and validate refresh token
  const stored = await env.DB.prepare(
    "SELECT rt.id, rt.user_id, rt.expires_at, u.email, u.name, u.picture FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id WHERE rt.token_hash = ?"
  ).bind(tokenHash).first();

  if (!stored) {
    return new Response(
      JSON.stringify({ error: "Invalid refresh token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check expiry
  if (new Date(stored.expires_at) < new Date()) {
    await env.DB.prepare("DELETE FROM refresh_tokens WHERE id = ?").bind(stored.id).run();
    return new Response(
      JSON.stringify({ error: "Refresh token expired" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Delete old refresh token (rotation)
  await env.DB.prepare("DELETE FROM refresh_tokens WHERE id = ?").bind(stored.id).run();

  // Issue new JWT
  const jwt = await signJWT(
    {
      sub: stored.user_id,
      email: stored.email,
      name: stored.name,
      picture: stored.picture,
    },
    env.JWT_SECRET
  );

  // Issue new refresh token
  const newRefreshToken = crypto.randomUUID() + "-" + crypto.randomUUID();
  const newHash = await hashToken(newRefreshToken);
  const newId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(newId, stored.user_id, newHash, expiresAt).run();

  return new Response(
    JSON.stringify({ token: jwt, refreshToken: newRefreshToken }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
