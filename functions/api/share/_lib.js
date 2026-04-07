// Shared helpers for /api/share/* endpoints
//
// Public read endpoint (no auth) + Premium-only write endpoints.

export const MAX_SHARED_PER_USER = 50;
export const MAX_SHARED_DATA_BYTES = 200 * 1024;
export const MAX_TOPIC_LEN = 2000;

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
