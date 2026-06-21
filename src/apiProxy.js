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

// Premium-only web search (Architecture B). Runs one retrieval server-side and
// returns { provider, query, results: [{title,url,snippet}] }. Non-streaming.
// Returns { results: [] } on any failure so the discussion never blocks on
// search — a round just proceeds without injected evidence.
export async function callProxySearch(token, query, signal, sessionId) {
  try {
    const res = await fetch("/api/search/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ query, sessionId }),
      signal,
    });
    if (!res.ok) return { results: [] };
    const json = await res.json();
    return { provider: json?.provider, query: json?.query, results: Array.isArray(json?.results) ? json.results : [] };
  } catch {
    return { results: [] };
  }
}

export async function callProxyClaude(token, model, sys, user, onChunk, signal, sessionId, turnNumber, userParts) {
  const body = { model, system: sys, message: user, sessionId, turnNumber };
  if (userParts && userParts.cachePrefix && userParts.variable) {
    body.userParts = { cachePrefix: userParts.cachePrefix, variable: userParts.variable };
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

export async function callProxyChatGPT(token, model, sys, user, onChunk, signal, sessionId, turnNumber) {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ model, system: sys, message: user, sessionId, turnNumber }),
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
      const chunk = json?.choices?.[0]?.delta?.content ?? "";
      if (chunk) { full += chunk; onChunk(chunk); }
    } catch { /* skip */ }
  }, signal);
  return full;
}

export async function callProxyGemini(token, model, sys, user, onChunk, signal, sessionId, turnNumber) {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ model, system: sys, message: user, sessionId, turnNumber }),
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
