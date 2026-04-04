// Google OAuth login initiation
export async function onRequestGet(context) {
  const { env } = context;
  const clientId = env.GOOGLE_CLIENT_ID;
  const redirectUri = env.OAUTH_REDIRECT_URI || `${new URL(context.request.url).origin}/api/auth/callback`;

  // KV is required for CSRF protection - fail closed
  if (!env.KV) {
    return new Response("Service temporarily unavailable", { status: 503 });
  }

  const state = crypto.randomUUID();
  await env.KV.put(`oauth_state:${state}`, "1", { expirationTtl: 300 });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  return Response.redirect(url, 302);
}
