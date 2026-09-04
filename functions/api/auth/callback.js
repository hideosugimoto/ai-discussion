// Google OAuth callback - exchanges code for tokens, creates/updates user, issues JWT + refresh token

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

async function createRefreshToken(db, userId) {
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  const tokenHash = await hashToken(token);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Delete old refresh tokens for this user (max 5 sessions)
  const existing = await db.prepare(
    "SELECT id FROM refresh_tokens WHERE user_id = ? ORDER BY created_at DESC"
  ).bind(userId).all();

  if (existing.results && existing.results.length >= 5) {
    const toDelete = existing.results.slice(4);
    for (const row of toDelete) {
      await db.prepare("DELETE FROM refresh_tokens WHERE id = ?").bind(row.id).run();
    }
  }

  await db.prepare(
    "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(id, userId, tokenHash, expiresAt).run();

  return token;
}

export async function onRequestGet(context) {
  // Which stage the handler reached, for the catch below. The 500 response
  // stays opaque to the client (Layer 5); this only narrows the failure down
  // in the Cloudflare logs, where the swallowed exception was invisible before.
  let step = "init";
  try {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectWithError("OAuth denied: " + error, url.origin);
  }

  if (!code || !state) {
    return redirectWithError("Missing code or state", url.origin);
  }

  // KV is required for CSRF protection - fail closed
  if (!env.KV) {
    return redirectWithError("Server configuration error", url.origin);
  }

  // Verify CSRF state (mandatory)
  step = "kv_get_state";
  const stored = await env.KV.get(`oauth_state:${state}`);
  if (!stored) {
    return redirectWithError("Invalid state (CSRF check failed)", url.origin);
  }
  await env.KV.delete(`oauth_state:${state}`);

  // Exchange code for tokens
  step = "token_exchange";
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri:
        env.OAUTH_REDIRECT_URI || `${url.origin}/api/auth/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return redirectWithError("Token exchange failed", url.origin);
  }

  step = "parse_token_response";
  const tokens = await tokenRes.json();

  // Get user info
  step = "fetch_userinfo";
  const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) {
    return redirectWithError("Failed to get user info", url.origin);
  }

  step = "parse_userinfo";
  const googleUser = await userRes.json();

  // Upsert user in D1
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  step = "db_select_user";
  const existing = await env.DB.prepare(
    "SELECT id, plan FROM users WHERE email = ?"
  )
    .bind(googleUser.email)
    .first();

  let user;
  if (existing) {
    step = "db_update_user";
    await env.DB.prepare(
      "UPDATE users SET name = ?, picture = ?, updated_at = ? WHERE id = ?"
    )
      .bind(googleUser.name, googleUser.picture, now, existing.id)
      .run();
    user = { id: existing.id, plan: existing.plan };
  } else {
    step = "db_insert_user";
    await env.DB.prepare(
      "INSERT INTO users (id, email, name, picture, plan, created_at, updated_at) VALUES (?, ?, ?, ?, 'free', ?, ?)"
    )
      .bind(userId, googleUser.email, googleUser.name, googleUser.picture, now, now)
      .run();
    user = { id: userId, plan: "free" };
  }

  // Issue JWT (short-lived, 15 min)
  step = "sign_jwt";
  const jwt = await signJWT(
    {
      sub: user.id,
      email: googleUser.email,
      name: googleUser.name,
      picture: googleUser.picture,
    },
    env.JWT_SECRET
  );

  // Issue refresh token (long-lived, 30 days)
  step = "create_refresh_token";
  const refreshToken = await createRefreshToken(env.DB, user.id);

  // Store both tokens in KV with a one-time exchange code (60s TTL)
  step = "kv_put_auth_code";
  const exchangeCode = crypto.randomUUID();
  await env.KV.put(
    `auth_code:${exchangeCode}`,
    JSON.stringify({ token: jwt, refreshToken }),
    { expirationTtl: 60 }
  );

  const redirectUrl = new URL("/", url.origin);
  redirectUrl.searchParams.set("auth_code", exchangeCode);

  return Response.redirect(redirectUrl.toString(), 302);

  } catch (e) {
    // Log to Cloudflare only — the client still gets an opaque 500. Deliberately
    // no email/token/code in here: `step` plus the error identity is enough to
    // locate the failure without putting user identifiers into the log.
    console.error(
      `[auth/callback] failed at step=${step}`,
      e && e.name,
      e && e.message,
      e && e.stack,
    );
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function redirectWithError(message, origin) {
  const url = new URL("/", origin);
  url.searchParams.set("auth_error", message);
  return Response.redirect(url.toString(), 302);
}
