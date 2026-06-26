// Pure helpers for the dynamic OG image — deliberately free of any workers-og /
// WASM import so the card data + glyph subset stay unit-testable in plain JS.
// The route handler ([id].js) composes these with workers-og's ImageResponse.
import { escapeHtmlAttr } from "../api/share/_lib.js";

export const W = 1200, H = 630;

// All on-card label strings in one place. glyphTextFor() derives the font
// subset from these (not a hand-listed string) so editing a label can never
// silently drop a glyph and render tofu (□) in the image.
export const OG_LABELS = {
  brand: "3 AI Discussion — Claude / ChatGPT / Gemini",
  eyebrow: "この議題を3つのAIが議論しました",
  agree: "合意",
  conflict: "対立",
  unresolved: "未解決",
  rounds: "ラウンド議論",
};

// Pull the headline numbers out of a stored discussion snapshot. Mirrors the
// logic in buildShareMeta so the image and the <meta> description agree.
export function deriveCard(topic, dataJson) {
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

// Exact glyph set we render → loadGoogleFont subsets the font to just this.
export function glyphTextFor(card) {
  return card.topic + Object.values(OG_LABELS).join("") + "0123456789";
}

export function buildHtml(card) {
  const e = escapeHtmlAttr;
  const L = OG_LABELS;
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
            <div style="display:flex;font-size:24px;font-weight:700;color:#8c8478;">${e(L.brand)}</div>
          </div>
          <div style="display:flex;font-size:22px;color:#b8af9a;margin-top:30px;">${e(L.eyebrow)}</div>
          <div style="display:flex;font-size:46px;font-weight:700;color:#f0ece4;line-height:1.32;margin-top:12px;">${e(card.topic)}</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div style="display:flex;align-items:center;gap:32px;">
            ${chip("#4a9068", L.agree, card.agree)}
            ${chip("#ef4444", L.conflict, card.conflict)}
            ${chip("#d4922a", L.unresolved, card.unresolved)}
          </div>
          <div style="display:flex;font-size:24px;font-weight:700;color:#8c8478;">${card.rounds} ${e(L.rounds)}</div>
        </div>
      </div>
    </div>`;
}
