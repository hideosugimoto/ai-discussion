// Dynamic per-discussion OG image (1200×630 PNG) for shared links.
//
// Crawlers (X / LINE / Slack / Facebook) fetch this when a /?share=ID link is
// posted, so the preview shows the actual topic + outcome counts instead of a
// generic card. Rendered server-side with workers-og (satori + resvg-wasm);
// Japanese glyphs are loaded on demand via loadGoogleFont's `text` subset.
//
// Design mirrors src/lib/shareImage.js (the client-side canvas version) so the
// in-app "📸 画像で保存" and the SNS preview stay visually consistent.
import { ImageResponse, loadGoogleFont } from "workers-og";
import { validateShareId } from "../api/share/_lib.js";
import { W, H, deriveCard, buildHtml, glyphTextFor } from "./_card.js";

const FALLBACK = "/og.png";

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const origin = new URL(request.url).origin;
  const fallback = () => Response.redirect(origin + FALLBACK, 302);

  try {
    // The route is /og/<id>.png — strip the extension before validating.
    const raw = String(params?.id || "").replace(/\.png$/i, "");
    const id = validateShareId(raw);
    if (!id || !env?.DB) return fallback();

    const row = await env.DB.prepare(
      "SELECT topic, data_json, expires_at FROM shared_discussions WHERE id = ?"
    ).bind(id).first();
    const live = row && (!row.expires_at || isNaN(new Date(row.expires_at).getTime()) || new Date(row.expires_at).getTime() >= Date.now());
    if (!live) return fallback();

    const card = deriveCard(row.topic, row.data_json);
    const html = buildHtml(card);

    // Subset the font to exactly the glyphs we render (topic + labels + digits)
    // so the download stays small and fast at crawl time. Derived from the
    // label constants so it can never drift out of sync with the rendered text.
    const glyphText = glyphTextFor(card);
    const [bold, regular] = await Promise.all([
      loadGoogleFont({ family: "Noto Sans JP", weight: 700, text: glyphText }),
      loadGoogleFont({ family: "Noto Sans JP", weight: 400, text: glyphText }),
    ]);

    return new ImageResponse(html, {
      width: W,
      height: H,
      format: "png",
      fonts: [
        { name: "Noto Sans JP", data: bold, weight: 700, style: "normal" },
        { name: "Noto Sans JP", data: regular, weight: 400, style: "normal" },
      ],
      headers: {
        // Shares are immutable snapshots → cache hard at the edge.
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (e) {
    console.error("[og-image] render failed:", e?.message || e);
    return fallback();
  }
}
