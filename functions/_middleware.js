import { validateShareId, buildShareMeta, shareMetaTagsHtml } from "./api/share/_lib.js";

// Layer 1: Global security headers
//
// CSP は2系統:
//  - LP (/lp, /lp.html, /lp.js): Google Fonts + Cloudflare Insights を許可
//  - それ以外 (アプリ本体): strict (self のみ)
const APP_CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: https:; " +
  "connect-src 'self' https://accounts.google.com https://api.stripe.com https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com; " +
  "frame-src https://checkout.stripe.com; " +
  "object-src 'none'; " +
  "base-uri 'self'";

const LP_CSP =
  "default-src 'self'; " +
  "script-src 'self' https://static.cloudflareinsights.com https://challenges.cloudflare.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: https:; " +
  "connect-src 'self' https://cloudflareinsights.com https://challenges.cloudflare.com; " +
  "frame-src 'self' https://challenges.cloudflare.com; " +
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

    // Dynamic OG/Twitter meta for shared-discussion links (/?share=ID) so link
    // previews on X/LINE/Slack show the topic + outcome instead of a bare URL.
    // Best-effort: any failure falls through to the normal SPA response.
    const shareId = url.searchParams.get("share");
    const contentType = response.headers.get("content-type") || "";
    if (shareId && url.pathname === "/" && contentType.includes("text/html") && context.env?.DB) {
      try {
        const id = validateShareId(shareId);
        if (id) {
          const row = await context.env.DB.prepare(
            "SELECT topic, data_json, expires_at FROM shared_discussions WHERE id = ?"
          ).bind(id).first();
          const live = row && (!row.expires_at || isNaN(new Date(row.expires_at).getTime()) || new Date(row.expires_at).getTime() >= Date.now());
          if (live) {
            const meta = buildShareMeta(row.topic, row.data_json, url.origin, id);
            const tags = shareMetaTagsHtml(meta);
            return new HTMLRewriter()
              .on("title", { element(el) { el.setInnerContent(meta.title); } })
              .on("head", { element(el) { el.append(tags, { html: true }); } })
              .transform(response);
          }
        }
      } catch (e) {
        console.error("[og-meta] injection failed:", e?.message || e);
      }
    }

    return response;
  } catch (e) {
    console.error("[root/_middleware] Unhandled error:", e?.message || e, e?.stack || "");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
