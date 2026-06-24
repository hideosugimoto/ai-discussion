// Premium API proxy - calls AI through server-side proxy
// Reuses the same SSE parsing logic as direct API calls

async function readSSE(res, onChunk, signal) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal?.aborted) { reader.cancel(); return; }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data && data !== "[DONE]") onChunk(data);
      }
    }
  }
}

// Premium-only web search (Architecture B). Runs one or more facet retrievals
// server-side and returns merged { provider, results: [{title,url,snippet}] }.
// Accepts a single query string or an array of facet queries. Non-streaming.
// Returns { results: [] } on any failure so the discussion never blocks on
// search — a round just proceeds without injected evidence.
export async function callProxySearch(token, queries, signal, sessionId) {
  try {
    const body = Array.isArray(queries)
      ? { queries, sessionId }
      : { query: queries, sessionId };
    const res = await fetch("/api/search/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) return { results: [] };
    const json = await res.json();
    return { providers: json?.providers || [], results: Array.isArray(json?.results) ? json.results : [] };
  } catch {
    return { results: [] };
  }
}

export async function callProxyClaude(token, model, sys, user, onChunk, signal, sessionId, turnNumber, userParts, nativeSearch, searchMaxUses) {
  const body = { model, system: sys, message: user, sessionId, turnNumber };
  if (userParts && userParts.cachePrefix && userParts.variable) {
    body.userParts = { cachePrefix: userParts.cachePrefix, variable: userParts.variable };
  }
  if (nativeSearch) {
    body.nativeSearch = true;
    if (searchMaxUses) body.searchMaxUses = searchMaxUses;
  }
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error || `Proxy: ${res.status}`);
  }
  let full = "";
  await readSSE(res, (data) => {
    try {
      const json = JSON.parse(data);
      const chunk = json?.delta?.text ?? "";
      if (chunk) { full += chunk; onChunk(chunk); }
    } catch { /* skip */ }
  }, signal);
  return full;
}

// Extract the text delta from a ChatGPT SSE event. Two shapes coexist:
//   - Chat Completions (shared / no-search): choices[].delta.content
//   - Responses API (native search):         response.output_text.delta (.delta)
// Returns "" for any other event (usage frames, tool-call markers, etc.).
export function extractChatGPTChunk(json) {
  if (json?.type === "response.output_text.delta") return json?.delta ?? "";
  return json?.choices?.[0]?.delta?.content ?? "";
}

export async function callProxyChatGPT(token, model, sys, user, onChunk, signal, sessionId, turnNumber, nativeSearch) {
  const body = { model, system: sys, message: user, sessionId, turnNumber };
  if (nativeSearch) body.nativeSearch = true;
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error || `Proxy: ${res.status}`);
  }
  let full = "";
  await readSSE(res, (data) => {
    try {
      const json = JSON.parse(data);
      const chunk = extractChatGPTChunk(json);
      if (chunk) { full += chunk; onChunk(chunk); }
    } catch { /* skip */ }
  }, signal);
  return full;
}

export async function callProxyGemini(token, model, sys, user, onChunk, signal, sessionId, turnNumber, nativeSearch) {
  const body = { model, system: sys, message: user, sessionId, turnNumber };
  if (nativeSearch) body.nativeSearch = true;
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error || `Proxy: ${res.status}`);
  }
  let full = "";
  await readSSE(res, (data) => {
    try {
      const json = JSON.parse(data);
      const chunk = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (chunk) { full += chunk; onChunk(chunk); }
    } catch { /* skip */ }
  }, signal);
  return full;
}
