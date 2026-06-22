// Search provider: Gemini "Grounding with Google Maps".
//
// Purpose-built for place / recommendation queries (restaurants, spots,
// lodging) — returns real places with names/addresses backed by Google Maps,
// where generic web search is weak. Uses the existing GOOGLE_AI_API_KEY.
//
// Same uniform return shape as the other providers:
//   { provider, query, sources: [{ title, url, snippet }] }
// `title` = place name, `url` = Google Maps link, `snippet` = the cited fact
// segments (hours / details) attributed to that place.

const DEFAULT_GEMINI_MAPS_MODEL = "gemini-3.1-flash-lite";

export async function search(query, env) {
  const apiKey = env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY not configured");

  const model = env.SEARCH_GEMINI_MODEL || DEFAULT_GEMINI_MAPS_MODEL;

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
                  `次の件について、実在する店舗・施設・場所を、営業時間や特徴とあわせて` +
                  `具体的に挙げてください。各項目は実在の場所に基づくものにしてください。\n\n${query}`,
              },
            ],
          },
        ],
        tools: [{ googleMaps: {} }],
        // We only keep the place sources, not the prose answer, so cap the
        // generated output (kept generous so place discovery isn't truncated).
        generationConfig: { maxOutputTokens: 1024 },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini Maps grounding failed: ${res.status}`);
  }

  const data = await res.json();
  return normalize(query, data);
}

// Convert Gemini Maps groundingMetadata into the uniform { sources } shape.
// Maps chunks live under groundingChunks[].maps (vs .web for search grounding).
function normalize(query, data) {
  const meta = data?.candidates?.[0]?.groundingMetadata;
  const chunks = Array.isArray(meta?.groundingChunks) ? meta.groundingChunks : [];
  const supports = Array.isArray(meta?.groundingSupports) ? meta.groundingSupports : [];

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
    const maps = c?.maps || {};
    const facts = snippetsByChunk.get(i) || [];
    const uniqueFacts = [...new Set(facts)];
    return {
      title: (maps.title || "").trim(),
      url: (maps.uri || "").trim(),
      snippet: uniqueFacts.join(" / "),
    };
  }).filter((s) => s.url || s.title);

  return { provider: "gemini-maps-grounding", query, sources };
}
