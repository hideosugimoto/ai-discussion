// AI proxy: SSE streaming with token usage tracking

import { getEffectiveLimitMicro } from "../_lib_billing.js";
import {
  MODEL_PRICING,
  detectProvider,
  calcCostMicro,
  estimateMaxCostMicro,
  calcSearchCostMicro,
  nativeSearchPricingKey,
} from "../../../src/models.config.js";

// Layer 4: Input validation
function validateRequest(body) {
  if (!body || typeof body !== "object") return "Invalid request body";
  if (typeof body.model !== "string" || !MODEL_PRICING[body.model]) {
    return "Invalid or unsupported model";
  }
  if (typeof body.system !== "string" || body.system.length > 10000) {
    return "Invalid system prompt (max 10000 chars)";
  }
  if (typeof body.message !== "string" || body.message.length > 50000) {
    return "Invalid message (max 50000 chars)";
  }
  if (body.nativeSearch !== undefined && typeof body.nativeSearch !== "boolean") {
    return "Invalid nativeSearch";
  }
  // searchMaxUses bounds the provider's agentic web-search loop. Clamp it server-
  // side: it flows straight to the upstream tool config and each search is billed,
  // so an unbounded value is a cost-amplification vector.
  if (body.searchMaxUses !== undefined) {
    if (!Number.isInteger(body.searchMaxUses) || body.searchMaxUses < 1 || body.searchMaxUses > 5) {
      return "Invalid searchMaxUses (must be an integer 1-5)";
    }
  }
  if (body.userParts !== undefined) {
    if (typeof body.userParts !== "object" || body.userParts === null) {
      return "Invalid userParts";
    }
    if (typeof body.userParts.cachePrefix !== "string" || body.userParts.cachePrefix.length > 50000) {
      return "Invalid userParts.cachePrefix (max 50000 chars)";
    }
    if (typeof body.userParts.variable !== "string" || body.userParts.variable.length > 50000) {
      return "Invalid userParts.variable (max 50000 chars)";
    }
  }
  return null;
}

async function checkUsageLimit(db, userId, limitMicro) {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const result = await db
    .prepare(
      "SELECT COALESCE(SUM(cost_micro), 0) as total FROM usage_monthly WHERE user_id = ? AND year_month = ?"
    )
    .bind(userId, yearMonth)
    .first();
  const total = result?.total || 0;
  return { totalMicro: total, remaining: limitMicro - total, exceeded: total >= limitMicro };
}

// Pre-debit: insert estimated cost BEFORE API call to prevent race condition
async function preDebitUsage(db, userId, model, estimatedMicro) {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  const result = await db.batch([
    db.prepare(
      "INSERT INTO usage_monthly (user_id, year_month, model, input_tokens, output_tokens, cost_micro) VALUES (?, ?, ?, 0, 0, ?)"
    ).bind(userId, yearMonth, model, estimatedMicro),
    db.prepare(
      `INSERT INTO usage_daily (user_id, date, total_cost_micro, request_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id, date) DO UPDATE SET
         total_cost_micro = total_cost_micro + ?,
         request_count = request_count + 1`
    ).bind(userId, today, estimatedMicro, estimatedMicro),
  ]);
  // Return the inserted row ID for later reconciliation
  return result[0]?.meta?.last_row_id;
}

// Insert analytics log (non-blocking, best-effort)
async function insertRequestLog(db, userId, sessionId, turnNumber, model, provider, inputTokens, outputTokens, latencyMs, cacheCreationTokens, cacheReadTokens) {
  try {
    await db.prepare(
      `INSERT INTO llm_request_log (user_id, session_id, turn_number, model, provider, input_tokens, output_tokens, latency_ms, cache_creation_input_tokens, cache_read_input_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(userId, sessionId || null, turnNumber || null, model, provider, inputTokens, outputTokens, latencyMs, cacheCreationTokens || 0, cacheReadTokens || 0).run();
  } catch {
    // Best-effort: don't fail the request if logging fails
  }
}

// Reconcile: update pre-debit record with actual usage
async function reconcileUsage(db, rowId, inputTokens, outputTokens, actualMicro, estimatedMicro) {
  const diffMicro = actualMicro - estimatedMicro;
  const today = new Date().toISOString().slice(0, 10);

  await db.batch([
    db.prepare(
      "UPDATE usage_monthly SET input_tokens = ?, output_tokens = ?, cost_micro = ? WHERE id = ?"
    ).bind(inputTokens, outputTokens, actualMicro, rowId),
    db.prepare(
      `UPDATE usage_daily SET total_cost_micro = total_cost_micro + ? WHERE user_id = (SELECT user_id FROM usage_monthly WHERE id = ?) AND date = ?`
    ).bind(diffMicro, rowId, today),
  ]);
}

// userParts (optional): { cachePrefix, variable } — when provided, split into
// a cacheable prefix block (topic+attachments) and a variable suffix block
// (history+intervention). cache_control on the prefix lets Anthropic cache the
// attachment text across rounds.
function buildAnthropicUserMessages(message, userParts) {
  if (userParts && userParts.cachePrefix && userParts.variable) {
    return [{
      role: "user",
      content: [
        { type: "text", text: userParts.cachePrefix, cache_control: { type: "ephemeral" } },
        { type: "text", text: userParts.variable },
      ],
    }];
  }
  return [{ role: "user", content: message }];
}

// Provider-specific API calls. `nativeSearch` enables each provider's own web
// search tool (searchMode === "native"); maxUses bounds the agentic loop.
async function callAnthropic(apiKey, model, system, message, userParts, nativeSearch, maxUses) {
  const body = {
    model,
    max_tokens: 1500,
    stream: true,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: buildAnthropicUserMessages(message, userParts),
  };
  if (nativeSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: maxUses || 2 }];
  }
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
}

async function callOpenAI(apiKey, model, system, message) {
  // Chat Completions path (shared / no-search mode). Native search uses the
  // Responses API instead (callOpenAIResponses) — web_search isn't available here.
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: 8192,
      stream: true,
      stream_options: { include_usage: true },
      // OpenAI auto-caches matching prompt prefixes (50% input cost reduction)
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
    }),
  });
}

// OpenAI native search: Responses API (/v1/responses) with the web_search tool.
// Streaming emits response.output_text.delta events; usage + web_search tool
// calls arrive on the response.completed event.
async function callOpenAIResponses(apiKey, model, system, message) {
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      max_output_tokens: 8192,
      instructions: system,
      input: message,
      tools: [{ type: "web_search" }],
    }),
  });
}

async function callGoogle(apiKey, model, system, message, nativeSearch) {
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ parts: [{ text: message }] }],
    generationConfig: { maxOutputTokens: 8192 },
  };
  if (nativeSearch) {
    body.tools = [{ google_search: {} }];
  }
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    }
  );
}

export async function onRequestPost(context) {
  const { request, env, data } = context;
  const user = data.user;

  // Check plan from database (not from JWT claim)
  if (!user) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  const dbUser = await env.DB.prepare("SELECT plan FROM users WHERE id = ?")
    .bind(user.sub)
    .first();
  if (!dbUser || dbUser.plan === "free" || !dbUser.plan) {
    return new Response(
      JSON.stringify({ error: "Premium plan required" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  const userPlan = dbUser.plan; // 'premium' | 'plus'

  // Parse and validate input (Layer 4)
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const validationError = validateRequest(body);
  if (validationError) {
    return new Response(
      JSON.stringify({ error: validationError }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check monthly usage limit (base + active credits, in microdollars)
  const { effective: limitMicro } = await getEffectiveLimitMicro(env.DB, env, user.sub, userPlan);
  const usage = await checkUsageLimit(env.DB, user.sub, limitMicro);
  if (usage.exceeded) {
    return new Response(
      JSON.stringify({
        error: "Monthly usage limit exceeded",
        total_usd: usage.totalMicro / 1_000_000,
        limit_usd: limitMicro / 1_000_000,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  // Pre-debit estimated cost to prevent race condition (#2,3)
  const estimatedMicro = estimateMaxCostMicro(body.model);
  const preDebitRowId = await preDebitUsage(env.DB, user.sub, body.model, estimatedMicro);

  const provider = detectProvider(body.model);
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 100) : null;
  const turnNumber = typeof body.turnNumber === "number" && Number.isInteger(body.turnNumber) && body.turnNumber > 0 && body.turnNumber <= 100 ? body.turnNumber : null;
  const apiCallStart = Date.now();

  const apiKeyMap = {
    anthropic: env.ANTHROPIC_API_KEY,
    openai: env.OPENAI_API_KEY,
    google: env.GOOGLE_AI_API_KEY,
  };
  const apiKey = apiKeyMap[provider];

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "API key not configured for provider" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Native search mode: enable each provider's own web search tool this call.
  const nativeSearch = body.nativeSearch === true;

  // Call upstream API
  let upstream;
  try {
    if (provider === "anthropic") {
      upstream = await callAnthropic(apiKey, body.model, body.system, body.message, body.userParts, nativeSearch, body.searchMaxUses);
    } else if (provider === "openai") {
      upstream = nativeSearch
        ? await callOpenAIResponses(apiKey, body.model, body.system, body.message)
        : await callOpenAI(apiKey, body.model, body.system, body.message);
    } else if (provider === "google") {
      upstream = await callGoogle(apiKey, body.model, body.system, body.message, nativeSearch);
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Upstream API call failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!upstream.ok) {
    // Layer 5: Sanitize error - don't leak upstream details
    const status = upstream.status === 429 ? 429 : 502;
    return new Response(
      JSON.stringify({ error: "AI service error", status: upstream.status }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }

  // Stream response to client, track tokens at the end
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const userId = user.sub;
  const model = body.model;

  // Process SSE stream in background
  context.waitUntil(
    (async () => {
      const reader = upstream.body.getReader();
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheCreationTokens = 0;
      let cacheReadTokens = 0;
      let nativeSearchCount = 0;
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Forward raw SSE to client
          await writer.write(encoder.encode(chunk));

          // Extract token usage from SSE events
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(jsonStr);

              // Anthropic usage (cache tokens live on message_start.usage).
              // server_tool_use.web_search_requests is a cumulative count of
              // native web searches; it appears on message_start and is updated
              // on message_delta — take the max so we never undercount.
              if (parsed.type === "message_start" && parsed.message?.usage) {
                const u = parsed.message.usage;
                inputTokens = u.input_tokens || 0;
                cacheCreationTokens = u.cache_creation_input_tokens || 0;
                cacheReadTokens = u.cache_read_input_tokens || 0;
                if (u.server_tool_use?.web_search_requests) {
                  nativeSearchCount = Math.max(nativeSearchCount, u.server_tool_use.web_search_requests);
                }
              }
              if (parsed.type === "message_delta" && parsed.usage) {
                outputTokens = parsed.usage.output_tokens || 0;
                if (parsed.usage.server_tool_use?.web_search_requests) {
                  nativeSearchCount = Math.max(nativeSearchCount, parsed.usage.server_tool_use.web_search_requests);
                }
              }

              // OpenAI Chat Completions usage (stream_options.include_usage).
              // prompt_tokens_details.cached_tokens is populated when auto-cache hits.
              if (parsed.usage && parsed.usage.prompt_tokens) {
                inputTokens = parsed.usage.prompt_tokens;
                outputTokens = parsed.usage.completion_tokens || 0;
                cacheReadTokens = parsed.usage.prompt_tokens_details?.cached_tokens || 0;
              }

              // OpenAI Responses API usage (native search). Final usage and the
              // web_search tool calls arrive together on response.completed.
              if (parsed.type === "response.completed" && parsed.response?.usage) {
                inputTokens = parsed.response.usage.input_tokens || 0;
                outputTokens = parsed.response.usage.output_tokens || 0;
                cacheReadTokens = parsed.response.usage.input_tokens_details?.cached_tokens || 0;
                const outputs = parsed.response.output || [];
                nativeSearchCount = outputs.filter((o) => String(o.type || "").includes("web_search")).length;
              }

              // Gemini usage (cachedContentTokenCount populated when explicit cache hits)
              if (parsed.usageMetadata) {
                inputTokens = parsed.usageMetadata.promptTokenCount || 0;
                outputTokens = parsed.usageMetadata.candidatesTokenCount || 0;
                cacheReadTokens = parsed.usageMetadata.cachedContentTokenCount || 0;
              }

              // Gemini native search: groundingMetadata signals a grounded
              // (search-backed) response. The API does not expose a per-call
              // search count, so treat a grounded response as one search.
              if (parsed.candidates?.[0]?.groundingMetadata) {
                nativeSearchCount = Math.max(nativeSearchCount, 1);
              }
            } catch {
              // Not valid JSON, skip
            }
          }
        }
      } finally {
        await writer.close();
      }

      // Reconcile pre-debit with actual usage
      const latencyMs = Date.now() - apiCallStart;
      if (inputTokens > 0 || outputTokens > 0) {
        let actualMicro = calcCostMicro(model, inputTokens, outputTokens);
        // Native search fee: add the per-search cost when this call used each
        // provider's own web search tool. priorCount=0 keeps Gemini inside its
        // monthly free tier (pre-launch single-user assumption); anthropic/openai
        // have no free tier so each search is billed.
        if (nativeSearch && nativeSearchCount > 0) {
          actualMicro += nativeSearchCount * calcSearchCostMicro(nativeSearchPricingKey(provider), 0);
        }
        await reconcileUsage(env.DB, preDebitRowId, inputTokens, outputTokens, actualMicro, estimatedMicro);
      }

      // Analytics log (best-effort)
      await insertRequestLog(env.DB, userId, sessionId, turnNumber, model, provider, inputTokens, outputTokens, latencyMs, cacheCreationTokens, cacheReadTokens);
    })()
  );

  // Layer 5: Return sanitized response (no upstream headers leaked)
  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
