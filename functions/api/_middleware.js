// Layer 2-3: CORS + Rate limiting + Auth for API routes

const CORS_ORIGINS = [
  "http://localhost:5173",
  "https://ai-discussion.pages.dev",
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = CORS_ORIGINS.includes(origin) ? origin : null;
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (allowed) {
    headers["Access-Control-Allow-Origin"] = allowed;
  }
  return headers;
}

function handleCORS(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }
  return null;
}

// Layer 2: KV-based rate limiting
async function checkRateLimit(request, kv) {
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";
  const key = `rl:${ip}`;
  const windowSec = 60;
  const maxRequests = 30;

  const current = await kv.get(key, { type: "json" });
  const now = Math.floor(Date.now() / 1000);

  if (!current || current.reset <= now) {
    await kv.put(key, JSON.stringify({ count: 1, reset: now + windowSec }), {
      expirationTtl: windowSec + 10,
    });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (current.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: current.reset };
  }

  await kv.put(
    key,
    JSON.stringify({ count: current.count + 1, reset: current.reset }),
    { expirationTtl: Math.max(60, current.reset - now + 10) }
  );
  return { allowed: true, remaining: maxRequests - current.count - 1 };
}

// Layer 3: JWT verification
async function verifyJWT(token, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const payload = parts[0] + "." + parts[1];
  const signature = Uint8Array.from(
    atob(parts[2].replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0)
  );

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(payload)
  );
  if (!valid) return null;

  const decoded = JSON.parse(
    atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
  );
  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;

  return decoded;
}

// Public routes that don't require auth
const PUBLIC_PATHS = [
  "/api/auth/google",
  "/api/auth/callback",
  "/api/auth/exchange",
  "/api/auth/refresh",
  "/api/billing/webhook",
];

export async function onRequest(context) {
  try {
  const { request, env } = context;
  const url = new URL(request.url);

  // CORS preflight
  const corsResponse = handleCORS(request);
  if (corsResponse) return corsResponse;

  // Rate limiting (Layer 2) - KV required, fail closed
  if (!env.KV) {
    return new Response(
      JSON.stringify({ error: "Service temporarily unavailable" }),
      {
        status: 503,
        headers: { ...corsHeaders(request), "Content-Type": "application/json" },
      }
    );
  }

  const rateResult = await checkRateLimit(request, env.KV);
  if (!rateResult.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests" }),
      {
        status: 429,
        headers: {
          ...corsHeaders(request),
          "Content-Type": "application/json",
          "Retry-After": String(rateResult.resetAt - Math.floor(Date.now() / 1000)),
        },
      }
    );
  }

  // Auth check (Layer 3) - skip for public routes
  const isPublic = PUBLIC_PATHS.some((p) => url.pathname === p);
  if (!isPublic) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: {
            ...corsHeaders(request),
            "Content-Type": "application/json",
          },
        }
      );
    }

    const jwtSecret = env.JWT_SECRET;
    if (!jwtSecret) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        {
          status: 500,
          headers: {
            ...corsHeaders(request),
            "Content-Type": "application/json",
          },
        }
      );
    }

    const user = await verifyJWT(token, jwtSecret);
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: {
            ...corsHeaders(request),
            "Content-Type": "application/json",
          },
        }
      );
    }

    context.data.user = user;
  }

  // Continue to route handler
  const response = await context.next();

  // Add CORS headers to response
  const headers = corsHeaders(request);
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
  } catch (e) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
