// ── SSE helper ────────────────────────────────────────────────

async function readSSE(res, onChunk, signal) {
  const reader  = res.body.getReader();
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

// ── Claude ────────────────────────────────────────────────────

export async function callClaude(apiKey, model, sys, user, onChunk, signal) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model, max_tokens: 1000, stream: true, system: sys,
      messages: [{ role: "user", content: user }],
    }),
    signal,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Claude: ${res.status}`);
  }
  let full = "";
  await readSSE(res, (data) => {
    try {
      const json = JSON.parse(data);
      const chunk = json?.delta?.text ?? "";
      if (chunk) { full += chunk; onChunk(chunk); }
    } catch {}
  }, signal);
  return full;
}

export async function validateClaude(apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `${res.status}`);
  }
}

// ── ChatGPT ───────────────────────────────────────────────────

export async function callChatGPT(apiKey, model, sys, user, onChunk, signal) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, max_tokens: 1000, stream: true,
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    }),
    signal,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `OpenAI: ${res.status}`);
  }
  let full = "";
  await readSSE(res, (data) => {
    try {
      const json  = JSON.parse(data);
      const chunk = json?.choices?.[0]?.delta?.content ?? "";
      if (chunk) { full += chunk; onChunk(chunk); }
    } catch {}
  }, signal);
  return full;
}

export async function validateChatGPT(apiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini", max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `${res.status}`);
  }
}

// ── Gemini ────────────────────────────────────────────────────

export async function callGemini(apiKey, model, sys, user, onChunk, signal) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ parts: [{ text: user }] }],
      }),
      signal,
    }
  );
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Gemini: ${res.status}`);
  }
  let full = "";
  await readSSE(res, (data) => {
    try {
      const json  = JSON.parse(data);
      const chunk = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (chunk) { full += chunk; onChunk(chunk); }
    } catch {}
  }, signal);
  return full;
}

export async function validateGemini(apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] }),
    }
  );
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `${res.status}`);
  }
}
