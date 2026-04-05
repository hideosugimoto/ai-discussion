// AI proxy: SSE streaming with token usage tracking

// Model pricing (microdollars per token) - 2026-04 rates
// 1 microdollar = $0.000001, so $5.00/1M tokens = 5 microdollars/token
const MODEL_PRICING = {
  "claude-opus-4-6":   { input: 5,    output: 25   },
  "claude-sonnet-4-6": { input: 3,    output: 15   },
  "gpt-4o":            { input: 2.5,  output: 10   },
  "gpt-4o-mini":       { input: 0.15, output: 0.6  },
  "gemini-2.5-pro":    { input: 1.25, output: 10   },
  "gemini-2.5-flash":  { input: 0.30, output: 2.5  },
};

// Returns cost in microdollars (integer) - no floating point accumulation
function calcCostMicro(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return Math.round(inputTokens * pricing.input + outputTokens * pricing.output);
}

// Estimate max cost for pre-debit (assumes max output tokens)
function estimateMaxCostMicro(model) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  // Assume 500 input + 4096 output as max estimate
  return Math.round(500 * pricing.input + 4096 * pricing.output);
}

function detectProvider(model) {
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("gpt")) return "openai";
  if (model.startsWith("gemini")) return "google";
  return null;
}

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
  return null;
}

// Convert USD to microdollars for limit comparison
function usdToMicro(usd) {
  return Math.round(usd * 1_000_000);
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
async function insertRequestLog(db, userId, sessionId, turnNumber, model, provider, inputTokens, outputTokens, latencyMs) {
  try {
    await db.prepare(
      `INSERT INTO llm_request_log (user_id, session_id, turn_number, model, provider, input_tokens, output_tokens, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(userId, sessionId || null, turnNumber || null, model, provider, inputTokens, outputTokens, latencyMs).run();
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

// Provider-specific API calls
async function callAnthropic(apiKey, model, system, message) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      stream: true,
      system,
      messages: [{ role: "user", content: message }],
    }),
  });
  return res;
}

async function callOpenAI(apiKey, model, system, message) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1000,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
    }),
  });
  return res;
}

async function callGoogle(apiKey, model, system, message) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: message }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
    }
  );
  return res;
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
  if (!dbUser || dbUser.plan !== "premium") {
    return new Response(
      JSON.stringify({ error: "Premium plan required" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

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

  // Check monthly usage limit (in microdollars)
  const limitMicro = usdToMicro(parseFloat(env.MONTHLY_COST_LIMIT_USD || "1.96"));
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

  // Call upstream API
  let upstream;
  try {
    if (provider === "anthropic") {
      upstream = await callAnthropic(apiKey, body.model, body.system, body.message);
    } else if (provider === "openai") {
      upstream = await callOpenAI(apiKey, body.model, body.system, body.message);
    } else if (provider === "google") {
      upstream = await callGoogle(apiKey, body.model, body.system, body.message);
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

              // Anthropic usage
              if (parsed.type === "message_start" && parsed.message?.usage) {
                inputTokens = parsed.message.usage.input_tokens || 0;
              }
              if (parsed.type === "message_delta" && parsed.usage) {
                outputTokens = parsed.usage.output_tokens || 0;
              }

              // OpenAI usage (stream_options.include_usage)
              if (parsed.usage && parsed.usage.prompt_tokens) {
                inputTokens = parsed.usage.prompt_tokens;
                outputTokens = parsed.usage.completion_tokens || 0;
              }

              // Gemini usage
              if (parsed.usageMetadata) {
                inputTokens = parsed.usageMetadata.promptTokenCount || 0;
                outputTokens = parsed.usageMetadata.candidatesTokenCount || 0;
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
        const actualMicro = calcCostMicro(model, inputTokens, outputTokens);
        await reconcileUsage(env.DB, preDebitRowId, inputTokens, outputTokens, actualMicro, estimatedMicro);
      }

      // Analytics log (best-effort)
      await insertRequestLog(env.DB, userId, sessionId, turnNumber, model, provider, inputTokens, outputTokens, latencyMs);
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
