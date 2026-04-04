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

export async function callProxyClaude(token, model, sys, user, onChunk, signal) {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ model, system: sys, message: user }),
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

export async function callProxyChatGPT(token, model, sys, user, onChunk, signal) {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ model, system: sys, message: user }),
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

export async function callProxyGemini(token, model, sys, user, onChunk, signal) {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ model, system: sys, message: user }),
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
