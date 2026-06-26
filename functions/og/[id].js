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
import { validateShareId, escapeHtmlAttr } from "../api/share/_lib.js";

const W = 1200, H = 630;
const FALLBACK = "/og.png";

// Pull the headline numbers out of a stored discussion snapshot. Mirrors the
// logic in buildShareMeta so the image and the <meta> description agree.
function deriveCard(topic, dataJson) {
  const t = (typeof topic === "string" && topic.trim() ? topic.trim() : "AIディスカッション").slice(0, 64);
  let agree = 0, conflict = 0, unresolved = 0, rounds = 0;
  try {
    const parsed = JSON.parse(dataJson || "{}");
    rounds = Array.isArray(parsed.discussion) ? parsed.discussion.length : 0;
    const summaries = Array.isArray(parsed.summaries) ? parsed.summaries.filter(Boolean) : [];
    const last = summaries[summaries.length - 1];
    if (last && !last.error) {
      agree = Array.isArray(last.agreements) ? last.agreements.length : 0;
      conflict = Array.isArray(last.disagreements) ? last.disagreements.length : 0;
      unresolved = Array.isArray(last.unresolved) ? last.unresolved.length : 0;
    }
  } catch { /* keep zeros */ }
  return { topic: t, agree, conflict, unresolved, rounds };
}

function buildHtml(card) {
  const e = escapeHtmlAttr;
  const chip = (color, label, n) =>
    `<div style="display:flex;align-items:center;">
       <div style="display:flex;width:18px;height:18px;border-radius:5px;background:${color};margin-right:10px;"></div>
       <div style="display:flex;font-size:30px;font-weight:700;color:#f0ece4;">${e(label)} ${n}</div>
     </div>`;
  return `
    <div style="display:flex;flex-direction:column;width:${W}px;height:${H}px;background:#1a1814;font-family:'Noto Sans JP';">
      <div style="display:flex;height:8px;width:${W}px;">
        <div style="display:flex;width:420px;height:8px;background:#7c3aed;"></div>
        <div style="display:flex;flex-grow:1;height:8px;background:#242018;"></div>
      </div>
      <div style="display:flex;flex-direction:column;flex-grow:1;justify-content:space-between;padding:52px 64px;">
        <div style="display:flex;flex-direction:column;">
          <div style="display:flex;align-items:center;">
            <div style="display:flex;width:14px;height:14px;border-radius:50%;background:#7c3aed;margin-right:12px;"></div>
            <div style="display:flex;font-size:24px;font-weight:700;color:#8c8478;">3 AI Discussion — Claude / ChatGPT / Gemini</div>
          </div>
          <div style="display:flex;font-size:22px;color:#b8af9a;margin-top:30px;">この議題を3つのAIが議論しました</div>
          <div style="display:flex;font-size:46px;font-weight:700;color:#f0ece4;line-height:1.32;margin-top:12px;">${e(card.topic)}</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:32px;">
            ${chip("#4a9068", "合意", card.agree)}
            ${chip("#ef4444", "対立", card.conflict)}
            ${chip("#d4922a", "未解決", card.unresolved)}
          </div>
          <div style="display:flex;font-size:24px;font-weight:700;color:#8c8478;">${card.rounds} ラウンド議論</div>
        </div>
      </div>
    </div>`;
}

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

    // Subset the font to exactly the glyphs we render (topic + fixed labels +
    // digits) so the download stays small and fast at crawl time.
    const glyphText =
      card.topic +
      "3 AI Discussion — Claude / ChatGPT / Geminiこの議題をつのが議論しました合意対立未解決ラウンド" +
      "0123456789";
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
