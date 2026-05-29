// ログイン不要お試し API。
// プリセット議題に対して Claude / ChatGPT / Gemini の fast モードを並列で叩き、
// 1ラウンドのみの応答を統合SSEで返す。
// - 認証不要（_middleware.js の PUBLIC_PATHS に登録）
// - レート制限: IP per 24h で TRIAL_DAILY_LIMIT 回
// - 議題は topicId 指定のみ受付（任意プロンプト送信を遮断）
// - usage は trial:counter:* で KV 集計のみ。D1 への記録は行わない

import { topicById } from "./topics.js";
import { MODE_MODELS, detectProvider } from "../../../src/models.config.js";

const TRIAL_DAILY_LIMIT = 10; // IP あたり 24h で 10 回
const TRIAL_DAILY_TTL_SEC = 24 * 60 * 60;

// 議論モードのプリセット（議題ごとにAIの役割を分けて意見が分かれやすくする）
const SYSTEM_PROMPTS = {
  claude:
    "あなたは経験豊富な相談相手です。質問者の価値観・長期視点・本音に寄り添う立場から、" +
    "簡潔に意見を述べてください。300字以内、です・ます調。冒頭の前置きや「私は」は省略し、" +
    "結論ファーストで書いてください。",
  chatgpt:
    "あなたは経験豊富な相談相手です。リスク・実利・現実的な制約を重視する立場から、" +
    "簡潔に意見を述べてください。300字以内、です・ます調。冒頭の前置きは省略し、" +
    "数字や根拠を添えて慎重派の立場で答えてください。",
  gemini:
    "あなたは経験豊富な分析家です。質問者が見落としがちな前提・別の選択肢・" +
    "意思決定に影響する隠れた変数を1つ指摘してください。300字以内、です・ます調。" +
    "冒頭の前置きは省略し、「視点の盲点」を指摘する立場で答えてください。",
};

const ipFromRequest = (request) =>
  request.headers.get("CF-Connecting-IP") ||
  request.headers.get("X-Forwarded-For") ||
  "unknown";

const today = () => new Date().toISOString().slice(0, 10);

async function checkTrialLimit(kv, ip) {
  const key = `trial:${ip}:${today()}`;
  const current = parseInt((await kv.get(key)) || "0", 10);
  if (current >= TRIAL_DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  await kv.put(key, String(current + 1), { expirationTtl: TRIAL_DAILY_TTL_SEC });
  return { allowed: true, remaining: TRIAL_DAILY_LIMIT - current - 1 };
}

// ── Provider call (non-streaming, fast mode) ──────
async function callClaudeOnce(apiKey, model, system, message) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: message }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const json = await res.json();
  return json.content?.[0]?.text || "";
}

async function callOpenAIOnce(apiKey, model, system, message) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: 800,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

async function callGoogleOnce(apiKey, model, system, message) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: message }] }],
        generationConfig: { maxOutputTokens: 800 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Google ${res.status}`);
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// fast モードのモデルタグに対応するプロバイダ呼び出し
async function callProvider(env, providerKey, message) {
  const { tag } = MODE_MODELS.fast[providerKey];
  const system = SYSTEM_PROMPTS[providerKey];
  const provider = detectProvider(tag);
  if (provider === "anthropic") return callClaudeOnce(env.ANTHROPIC_API_KEY, tag, system, message);
  if (provider === "openai")    return callOpenAIOnce(env.OPENAI_API_KEY, tag, system, message);
  if (provider === "google")    return callGoogleOnce(env.GOOGLE_AI_API_KEY, tag, system, message);
  throw new Error("Unknown provider");
}

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.KV) return jsonError(503, "Service temporarily unavailable");
  if (!env.ANTHROPIC_API_KEY || !env.OPENAI_API_KEY || !env.GOOGLE_AI_API_KEY) {
    return jsonError(500, "API keys not configured");
  }

  // IP 単位の日次レート制限
  const ip = ipFromRequest(request);
  const limit = await checkTrialLimit(env.KV, ip);
  if (!limit.allowed) {
    return jsonError(429, "本日のお試し上限に達しました。続きはログインして体験してください。");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON");
  }
  const topic = topicById(body?.topicId);
  if (!topic) return jsonError(400, "Invalid topicId");

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = async (obj) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  };

  context.waitUntil(
    (async () => {
      try {
        await send({ type: "start", topic: topic.text, remaining: limit.remaining });

        // 3AI を並列に投げ、応答が来た順にクライアントへ送る
        const calls = ["claude", "chatgpt", "gemini"].map((p) =>
          callProvider(env, p, topic.text)
            .then((text) => send({ type: "response", provider: p, text }))
            .catch(() => send({ type: "response", provider: p, text: "（応答取得に失敗しました）", error: true }))
        );
        await Promise.all(calls);

        await send({ type: "done" });
      } finally {
        await writer.close();
      }
    })()
  );

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}
