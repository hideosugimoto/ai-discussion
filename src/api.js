import { VALIDATION_MODELS } from "./models.config";
import { RESEARCH_CONFIG } from "./constants";
import { extractChatGPTChunk } from "./apiProxy";

// Native (per-AI) web search on the own-key path.
//
// The plan proxy (functions/api/chat/stream.js) enables the same three provider
// tools server-side; these direct calls mirror it so "自分のキーを優先" keeps
// 調査モード / 各AI個別検索 working instead of silently running searchless.
// Deliberately the BASIC Anthropic tool variants, exactly like the proxy: the
// 2026 dynamic-filtering variants run the code execution tool underneath, and
// max_content_tokens is the deterministic lever we want instead.
const ANTHROPIC_SEARCH_TOOL = "web_search_20250305";
const ANTHROPIC_FETCH_TOOL = "web_fetch_20250910";

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

// userParts (optional): { cachePrefix, variable } — when provided, the user
// message is split into a cacheable prefix block (topic + attachments) and a
// variable suffix (history + intervention). cache_control on the prefix lets
// Anthropic cache attachment text across rounds (~90% input cost saving once
// the cache is warm; the first round writes the cache at +25% cost).
function buildClaudeUserMessages(user, userParts) {
  if (userParts && userParts.cachePrefix && userParts.variable) {
    return [{
      role: "user",
      content: [
        { type: "text", text: userParts.cachePrefix, cache_control: { type: "ephemeral" } },
        { type: "text", text: userParts.variable },
      ],
    }];
  }
  return [{ role: "user", content: user }];
}

// Anthropic server tools for this call, or undefined when search is off.
// Must stay in sync with callAnthropic() in functions/api/chat/stream.js — the
// two paths are the same feature reached with different credentials.
export function buildClaudeSearchTools(nativeSearch, opts) {
  if (!nativeSearch) return undefined;
  // Same default as the proxy: one search unless the caller raises it. Each
  // web_search injects large results billed as cache_creation (1.25x), so the
  // loop bound is the main cost lever — and here the bill is the user's own.
  const uses = opts?.searchMaxUses || 1;
  const tools = [{ type: ANTHROPIC_SEARCH_TOOL, name: "web_search", max_uses: uses }];
  if (opts?.nativeFetch) {
    // 調査モード: search finds the page, fetch reads it. Without fetch the model
    // only ever sees result snippets and the ledger stays empty.
    tools.push({
      type: ANTHROPIC_FETCH_TOOL,
      name: "web_fetch",
      max_uses: uses,
      max_content_tokens: RESEARCH_CONFIG.fetchContentTokens,
    });
  }
  return tools;
}

export async function callClaude(apiKey, model, sys, user, onChunk, signal, userParts, nativeSearch, opts) {
  const tools = buildClaudeSearchTools(nativeSearch, opts);
  const body = {
    model, max_tokens: opts?.maxTokens || 1500, stream: true,
    system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
    messages: buildClaudeUserMessages(user, userParts),
    ...(tools ? { tools } : {}),
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
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
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.warn("Claude SSE parse error:", e.message);
    }
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
      model: VALIDATION_MODELS.claude,
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

// OpenAI native search needs the Responses API — web_search is not available on
// Chat Completions. Streaming emits response.output_text.delta events, so the
// chunk shape differs; extractChatGPTChunk handles both.
async function callChatGPTResponses(apiKey, model, sys, user, onChunk, signal, opts) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      stream: true,
      max_output_tokens: Math.max(opts?.maxTokens || 0, 8192),
      // "low" still reasons over search results; medium (the default) makes the
      // hidden reasoning tokens dominate the bill on short turns.
      reasoning: { effort: "low" },
      instructions: sys,
      input: user,
      tools: [{ type: "web_search" }],
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
      const chunk = extractChatGPTChunk(JSON.parse(data));
      if (chunk) { full += chunk; onChunk(chunk); }
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.warn("ChatGPT SSE parse error:", e.message);
    }
  }, signal);
  return full;
}

export async function callChatGPT(apiKey, model, sys, user, onChunk, signal, nativeSearch, opts) {
  if (nativeSearch) return callChatGPTResponses(apiKey, model, sys, user, onChunk, signal, opts);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, max_completion_tokens: Math.max(opts?.maxTokens || 0, 8192), stream: true,
      // OpenAI auto-caches matching prompt prefixes (50% input cost reduction)
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
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.warn("ChatGPT SSE parse error:", e.message);
    }
  }, signal);
  return full;
}

export async function validateChatGPT(apiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: VALIDATION_MODELS.chatgpt, max_completion_tokens: 16,
      messages: [{ role: "user", content: "hi" }],
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `${res.status}`);
  }
}

// ── Gemini ────────────────────────────────────────────────────

export async function callGemini(apiKey, model, sys, user, onChunk, signal, nativeSearch, opts) {
  const body = {
    system_instruction: { parts: [{ text: sys }] },
    contents: [{ parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: Math.max(opts?.maxTokens || 0, 8192) },
  };
  // Grounding with Google Search. Gemini has no per-call use bound like the
  // other two; the model decides how many queries it needs.
  if (nativeSearch) body.tools = [{ google_search: {} }];
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.warn("Gemini SSE parse error:", e.message);
    }
  }, signal);
  return full;
}

export async function validateGemini(apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${VALIDATION_MODELS.gemini}:generateContent?key=${apiKey}`,
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
