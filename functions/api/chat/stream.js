// AI proxy: SSE streaming with token usage tracking
import { calcCostUSD, detectProvider, MODEL_PRICING } from "./models.js";

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

async function checkUsageLimit(db, userId, limitUSD) {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const result = await db
    .prepare(
      "SELECT COALESCE(SUM(cost_usd), 0) as total FROM usage_monthly WHERE user_id = ? AND year_month = ?"
    )
    .bind(userId, yearMonth)
    .first();
  const total = result?.total || 0;
  return { total, remaining: limitUSD - total, exceeded: total >= limitUSD };
}

async function recordUsage(db, userId, model, inputTokens, outputTokens, costUSD) {
  const yearMonth = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  await db.batch([
    db.prepare(
      "INSERT INTO usage_monthly (user_id, year_month, model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(userId, yearMonth, model, inputTokens, outputTokens, costUSD),
    db.prepare(
      `INSERT INTO usage_daily (user_id, date, total_cost_usd, request_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id, date) DO UPDATE SET
         total_cost_usd = total_cost_usd + ?,
         request_count = request_count + 1`
    ).bind(userId, today, costUSD, costUSD),
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

  // Check monthly usage limit
  const limitUSD = parseFloat(env.MONTHLY_COST_LIMIT_USD || "1.96");
  const usage = await checkUsageLimit(env.DB, user.sub, limitUSD);
  if (usage.exceeded) {
    return new Response(
      JSON.stringify({
        error: "Monthly usage limit exceeded",
        total: usage.total,
        limit: limitUSD,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const provider = detectProvider(body.model);
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

      // Record usage after stream completes
      if (inputTokens > 0 || outputTokens > 0) {
        const cost = calcCostUSD(model, inputTokens, outputTokens);
        await recordUsage(env.DB, userId, model, inputTokens, outputTokens, cost);
      }
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
