// Search provider: Gemini "Grounding with Google Search".
//
// Uses the existing GOOGLE_AI_API_KEY (no new vendor account). We deliberately
// do NOT inject Gemini's synthesised answer into the discussion — that would
// invite all three AIs to parrot it. Instead we extract the grounding sources
// and the cited fact segments, and attribute each fact to its source. The
// caller injects this raw-ish evidence so each AI still reasons/selects on its
// own.
//
// Response shape (uniform across all providers in this folder):
//   { provider, query, sources: [{ title, url, snippet }] }
// where `snippet` for Gemini is the concatenation of the cited fact segments
// that reference that source.

// 3.x flash model → $14/1k grounding tier (matches SEARCH_PRICING). Overridable
// so the grounding model can be tuned without touching pricing assumptions
// (keep it on a 3.x model to stay aligned with the $14/1k price).
const DEFAULT_GEMINI_SEARCH_MODEL = "gemini-3.1-flash-lite";

export async function search(query, env) {
  const apiKey = env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured");

  const model = env.SEARCH_GEMINI_MODEL || DEFAULT_GEMINI_SEARCH_MODEL;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  `次の議題について、最新かつ事実ベースの情報をWeb検索で調べ、` +
                  `要点を簡潔に列挙してください。各要点は出典に基づくものにしてください。\n\n議題: ${query}`,
              },
            ],
          },
        ],
        tools: [{ google_search: {} }],
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini grounding failed: ${res.status}`);
  }

  const data = await res.json();
  return normalize(query, data);
}

// Convert Gemini's groundingMetadata into the uniform { sources } shape.
function normalize(query, data) {
  const meta = data?.candidates?.[0]?.groundingMetadata;
  const chunks = Array.isArray(meta?.groundingChunks) ? meta.groundingChunks : [];
  const supports = Array.isArray(meta?.groundingSupports) ? meta.groundingSupports : [];

  // Accumulate cited fact segments per chunk index.
  const snippetsByChunk = new Map();
  for (const s of supports) {
    const text = (s?.segment?.text || "").trim();
    if (!text) continue;
    const idxs = Array.isArray(s?.groundingChunkIndices) ? s.groundingChunkIndices : [];
    for (const idx of idxs) {
      if (!snippetsByChunk.has(idx)) snippetsByChunk.set(idx, []);
      snippetsByChunk.get(idx).push(text);
    }
  }

  const sources = chunks.map((c, i) => {
    const web = c?.web || {};
    const facts = snippetsByChunk.get(i) || [];
    // De-duplicate fact segments attributed to the same source.
    const uniqueFacts = [...new Set(facts)];
    return {
      title: (web.title || "").trim(),
      url: (web.uri || "").trim(),
      snippet: uniqueFacts.join(" / "),
    };
  }).filter((s) => s.url);

  return { provider: "gemini-grounding", query, sources };
}
