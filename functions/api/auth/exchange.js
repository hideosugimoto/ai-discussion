// Exchange one-time auth code for JWT token
// This prevents JWT from being exposed in URL query strings
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
  if (!code || typeof code !== "string") {
    return new Response(
      JSON.stringify({ error: "Missing auth code" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!env.KV) {
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const jwt = await env.KV.get(`auth_code:${code}`);
  if (!jwt) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired code" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Delete immediately (one-time use)
  await env.KV.delete(`auth_code:${code}`);

  return new Response(
    JSON.stringify({ token: jwt }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
