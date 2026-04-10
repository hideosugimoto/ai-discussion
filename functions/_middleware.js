// Layer 1: Global security headers
//
// CSP は2系統:
//  - LP (/lp, /lp.html, /lp.js): Google Fonts + Cloudflare Insights を許可
//  - それ以外 (アプリ本体): strict (self のみ)
const APP_CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' https:; " +
  "connect-src 'self' https://accounts.google.com https://api.stripe.com; " +
  "frame-src https://checkout.stripe.com";

const LP_CSP =
  "default-src 'self'; " +
  "script-src 'self' https://static.cloudflareinsights.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: https:; " +
  "connect-src 'self' https://cloudflareinsights.com; " +
  "object-src 'none'; " +
  "base-uri 'self'";

function isLandingPage(pathname) {
  return (
    pathname === "/lp" ||
    pathname === "/lp.html" ||
    pathname === "/lp.js" ||
    pathname === "/og.png" ||
    pathname === "/og.svg"
  );
}

export async function onRequest(context) {
  try {
    const response = await context.next();
    const url = new URL(context.request.url);

    // Security headers
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()"
    );
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
    response.headers.set(
      "Content-Security-Policy",
      isLandingPage(url.pathname) ? LP_CSP : APP_CSP
    );

    return response;
  } catch (e) {
    console.error("[root/_middleware] Unhandled error:", e?.message || e, e?.stack || "");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
