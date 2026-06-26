// Shared helpers for /api/share/* endpoints
//
// Public read endpoint (no auth) + Premium-only write endpoints.

export const MAX_SHARED_PER_USER = 50;
export const MAX_SHARED_DATA_BYTES = 200 * 1024;
export const MAX_TOPIC_LEN = 2000;

// Escape a string for safe insertion into an HTML attribute (OG/Twitter meta).
export function escapeHtmlAttr(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Build OG/Twitter metadata for a shared discussion link preview. Pure function
// (no I/O) so it is unit-testable; the middleware supplies the row + origin.
export function buildShareMeta(topic, dataJson, origin, id) {
  const t = (typeof topic === "string" && topic.trim() ? topic.trim() : "AIディスカッション").slice(0, 120);
  let desc = "Claude・ChatGPT・Geminiが同じ議題を多角的に議論し、合意点・対立点・結論まで整理します。";
  try {
    const parsed = JSON.parse(dataJson || "{}");
    const summaries = Array.isArray(parsed.summaries) ? parsed.summaries.filter(Boolean) : [];
    const rounds = Array.isArray(parsed.discussion) ? parsed.discussion.length : 0;
    const last = summaries[summaries.length - 1];
    if (last && !last.error) {
      const a = Array.isArray(last.agreements) ? last.agreements.length : 0;
      const d = Array.isArray(last.disagreements) ? last.disagreements.length : 0;
      const u = Array.isArray(last.unresolved) ? last.unresolved.length : 0;
      desc = `3つのAIが${rounds}ラウンド議論。合意${a}・対立${d}・未解決${u}点を整理しました。`;
    }
  } catch { /* keep generic description */ }
  return {
    title: `${t}｜3 AI Discussion`,
    description: desc.slice(0, 200),
    url: `${origin}/?share=${encodeURIComponent(id)}`,
    // Per-discussion dynamic card (functions/og/[id].js); falls back to the
    // static /og.png if rendering fails or the share is gone.
    image: `${origin}/og/${encodeURIComponent(id)}.png`,
    imageWidth: 1200,
    imageHeight: 630,
    imageAlt: `${t} — 3つのAIによる議論の結論カード`.slice(0, 200),
  };
}

// Render the OG/Twitter meta tags (escaped) for injection into <head>.
export function shareMetaTagsHtml(meta) {
  const e = escapeHtmlAttr;
  return [
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="3 AI Discussion">`,
    `<meta property="og:title" content="${e(meta.title)}">`,
    `<meta property="og:description" content="${e(meta.description)}">`,
    `<meta property="og:url" content="${e(meta.url)}">`,
    `<meta property="og:image" content="${e(meta.image)}">`,
    `<meta property="og:image:width" content="${e(meta.imageWidth ?? 1200)}">`,
    `<meta property="og:image:height" content="${e(meta.imageHeight ?? 630)}">`,
    `<meta property="og:image:alt" content="${e(meta.imageAlt ?? meta.title)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${e(meta.title)}">`,
    `<meta name="twitter:description" content="${e(meta.description)}">`,
    `<meta name="twitter:image" content="${e(meta.image)}">`,
    `<meta name="twitter:image:alt" content="${e(meta.imageAlt ?? meta.title)}">`,
  ].join("");
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function requirePremium(env, user) {
  if (!user) return { error: jsonResponse({ error: "Authentication required" }, 401) };
  const dbUser = await env.DB.prepare("SELECT plan FROM users WHERE id = ?")
    .bind(user.sub)
    .first();
  if (!dbUser || dbUser.plan === "free") {
    return { error: jsonResponse({ error: "Premium plan required" }, 403) };
  }
  return { ok: true };
}

// Generate a 22-char url-safe share token from crypto.randomUUID()
// (≈128 bits of entropy, suitable as an unguessable unlisted link)
export function generateShareId() {
  const uuid = crypto.randomUUID().replace(/-/g, "");
  // Convert hex (32 chars) to base64url-ish by re-encoding
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(uuid.slice(i * 2, i * 2 + 2), 16);
  }
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

// Strict id validation for path parameters.
// Length is fixed at 22 to match generateShareId() output exactly
// (defense in depth: generator and validator should never disagree).
export function validateShareId(id) {
  if (typeof id !== "string") return null;
  if (id.length !== 22) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

// CRITICAL: Sanitize a discussion payload before sharing publicly.
// We keep ONLY the discussion message text + summaries + topic + mode flags.
// We strip:
//   - personas (sensitive role labels)
//   - profile (user's personal info, injected at prompt time only)
//   - constitution (user's value system)
//   - any field starting with "_" (private metadata convention)
//   - userIntervention text (司会者として書かれた文章はprivate）
//
// Returns { ok: true, sanitized: {...} } or { ok: false, error: "..." }.
export function sanitizeForSharing(rawDataJson) {
  let parsed;
  try {
    parsed = JSON.parse(rawDataJson);
  } catch {
    return { ok: false, error: "Invalid data_json" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "data_json must be object" };
  }
  if (!Array.isArray(parsed.discussion)) {
    return { ok: false, error: "data_json.discussion must be array" };
  }

  // Build sanitized rounds: keep only modelId, text, error, isConclusion
  // Drop userIntervention (it may contain private moderator notes)
  const cleanRounds = parsed.discussion.map((round) => {
    if (!round || typeof round !== "object") return null;
    const messages = Array.isArray(round.messages)
      ? round.messages
          .map((m) => {
            if (!m || typeof m !== "object") return null;
            return {
              modelId: typeof m.modelId === "string" ? m.modelId : "unknown",
              text: typeof m.text === "string" ? m.text : "",
              error: typeof m.error === "string" ? m.error : null,
            };
          })
          .filter(Boolean)
      : [];
    return {
      messages,
      isConclusion: round.isConclusion === true,
    };
  }).filter(Boolean);

  // Sanitize summaries: keep structured fields, drop quote (which may contain
  // identifiable phrasing) -- actually the summaries are LLM-generated from
  // public discussion text, so they're fine. Keep as-is but ensure shape.
  const cleanSummaries = Array.isArray(parsed.summaries)
    ? parsed.summaries.map((s) => {
        if (!s || typeof s !== "object" || s.error) return s;
        return {
          agreements: Array.isArray(s.agreements) ? s.agreements : [],
          disagreements: Array.isArray(s.disagreements) ? s.disagreements : [],
          unresolved: Array.isArray(s.unresolved) ? s.unresolved : [],
          positionChanges: Array.isArray(s.positionChanges) ? s.positionChanges : [],
        };
      })
    : [];

  return {
    ok: true,
    sanitized: {
      discussion: cleanRounds,
      summaries: cleanSummaries,
      mode: typeof parsed.mode === "string" ? parsed.mode : "best",
      discussionMode: typeof parsed.discussionMode === "string" ? parsed.discussionMode : "standard",
    },
  };
}
