// ログイン不要お試し API。
// プリセット議題に対して Claude / ChatGPT / Gemini の fast モードを並列で叩き、
// 1ラウンドのみの応答を統合SSEで返す。
//
// セキュリティレイヤ:
//   1. Cloudflare Turnstile（bot 抑止 / 1IP=1人間チェック）
//   2. CF-Connecting-IP のみで IP 識別（X-Forwarded-For 等は信用しない）
//   3. 瞬間レート: 同一 IP / 10sec で 1 回（KV: trial:burst:{ip}）
//   4. 日次レート: 同一 IP / 24h で 10 回（KV: trial:{ip}:{date}）
//   5. グローバル日次上限: 全体 / 24h で 2000 回（KV: trial:global:{date}）
//   6. Content-Length 上限 1KB
//   7. 上流呼び出しは AbortSignal でクライアント切断と連動
// 任意プロンプト送信は遮断（topicId のみ受け、本文は server 側 topics.js で確定）

import { topicById } from "./topics.js";
import { MODE_MODELS, detectProvider } from "../../../src/models.config.js";

const TRIAL_DAILY_LIMIT        = 10;          // IP per 24h
const TRIAL_DAILY_TTL_SEC      = 86400;
const TRIAL_BURST_TTL_SEC      = 10;          // IP per 10s = 1
const TRIAL_GLOBAL_DAILY_LIMIT = 2000;        // 全体 per 24h（≒ $30/日想定上限）
const MAX_BODY_BYTES           = 1024;

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

// CF-Connecting-IP は Cloudflare が必ず上書き付与する。クライアント由来の
// X-Forwarded-For は信用しない。CF 経由でないと null を返して呼び出し側で拒否。
function ipFromRequest(request) {
  const ip = request.headers.get("CF-Connecting-IP");
  return ip && ip.trim() ? ip.trim() : null;
}

const today = () => new Date().toISOString().slice(0, 10);

async function checkTrialLimit(kv, ip) {
  const date      = today();
  const ipKey     = `trial:${ip}:${date}`;
  const burstKey  = `trial:burst:${ip}`;
  const globalKey = `trial:global:${date}`;

  // 瞬間バースト (10s = 1)
  const burst = await kv.get(burstKey);
  if (burst) return { allowed: false, reason: "burst", remaining: 0 };

  // グローバル上限
  const globalCurrent = parseInt((await kv.get(globalKey)) || "0", 10);
  if (globalCurrent >= TRIAL_GLOBAL_DAILY_LIMIT) {
    return { allowed: false, reason: "global", remaining: 0 };
  }

  // IP 日次上限
  const ipCurrent = parseInt((await kv.get(ipKey)) || "0", 10);
  if (ipCurrent >= TRIAL_DAILY_LIMIT) {
    return { allowed: false, reason: "ip", remaining: 0 };
  }

  // 加算（並列）
  await Promise.all([
    kv.put(burstKey,  "1",                  { expirationTtl: TRIAL_BURST_TTL_SEC }),
    kv.put(ipKey,     String(ipCurrent + 1), { expirationTtl: TRIAL_DAILY_TTL_SEC }),
    kv.put(globalKey, String(globalCurrent + 1), { expirationTtl: TRIAL_DAILY_TTL_SEC }),
  ]);

  return { allowed: true, remaining: TRIAL_DAILY_LIMIT - ipCurrent - 1 };
}

// Turnstile token を Cloudflare に検証してもらう。
// 環境変数 TURNSTILE_SECRET_KEY が未設定なら検証スキップ不可（fail closed）。
async function verifyTurnstile(secret, token, ip) {
  if (!secret) return { ok: false, reason: "server_misconfigured" };
  if (!token || typeof token !== "string") return { ok: false, reason: "missing_token" };

  const params = new URLSearchParams();
  params.append("secret",   secret);
  params.append("response", token);
  if (ip) params.append("remoteip", ip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: params,
    });
    if (!res.ok) return { ok: false, reason: "verify_http_error" };
    const json = await res.json();
    return { ok: !!json.success, reason: json["error-codes"]?.join(",") || "" };
  } catch {
    return { ok: false, reason: "verify_network_error" };
  }
}

// ── Provider call (non-streaming, fast mode, abortable) ──
async function callClaudeOnce(apiKey, model, system, message, signal) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: message }],
    }),
    signal,
  });
  if (!res.ok) throw new Error(`anthropic_${res.status}`);
  const json = await res.json();
  return json.content?.[0]?.text || "";
}

async function callOpenAIOnce(apiKey, model, system, message, signal) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_completion_tokens: 400,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
    }),
    signal,
  });
  if (!res.ok) throw new Error(`openai_${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

async function callGoogleOnce(apiKey, model, system, message, signal) {
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
        generationConfig: { maxOutputTokens: 400 },
      }),
      signal,
    }
  );
  if (!res.ok) throw new Error(`google_${res.status}`);
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callProvider(env, providerKey, message, signal) {
  const { tag } = MODE_MODELS.fast[providerKey];
  const system = SYSTEM_PROMPTS[providerKey];
  const provider = detectProvider(tag);
  if (provider === "anthropic") return callClaudeOnce(env.ANTHROPIC_API_KEY, tag, system, message, signal);
  if (provider === "openai")    return callOpenAIOnce(env.OPENAI_API_KEY,    tag, system, message, signal);
  if (provider === "google")    return callGoogleOnce(env.GOOGLE_AI_API_KEY, tag, system, message, signal);
  throw new Error("unknown_provider");
}

function jsonError(status, error) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// 一時的なデバッグ用ラッパ。本番安定後に削除。
export async function onRequestPost(context) {
  try {
    return await handleTrialPost(context);
  } catch (e) {
    console.error("[trial/chat] uncaught error:", e?.message, e?.stack);
    return new Response(
      JSON.stringify({ error: "trial_internal", detail: String(e?.message || e).slice(0, 200) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function handleTrialPost(context) {
  const { request, env } = context;

  if (!env.KV) return jsonError(503, "Service unavailable");
  if (!env.ANTHROPIC_API_KEY || !env.OPENAI_API_KEY || !env.GOOGLE_AI_API_KEY) {
    return jsonError(503, "Service unavailable");
  }

  // IP は Cloudflare 由来の CF-Connecting-IP のみ信頼
  const ip = ipFromRequest(request);
  if (!ip) return jsonError(400, "Bad request");

  // Content-Length 上限
  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_BODY_BYTES) return jsonError(413, "Payload too large");

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid request");
  }

  const topic = topicById(body?.topicId);
  if (!topic) return jsonError(400, "Invalid request");

  // Turnstile 検証
  const turnstile = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, body?.turnstileToken, ip);
  if (!turnstile.ok) {
    return jsonError(403, "verification_failed");
  }

  // レート制限（バースト → グローバル → IP日次）
  const limit = await checkTrialLimit(env.KV, ip);
  if (!limit.allowed) {
    const messageByReason = {
      burst:  "短時間に連続リクエストがありました。少し待って再試行してください。",
      global: "本日のお試し総枠が上限に達しました。明日以降か、ログインしてご利用ください。",
      ip:     "本日のお試し上限に達しました。続きはログインして体験してください。",
    };
    return jsonError(429, messageByReason[limit.reason] || "rate_limited");
  }

  // クライアント切断 → 上流 fetch も abort
  const abort = new AbortController();
  request.signal?.addEventListener("abort", () => abort.abort(), { once: true });

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = async (obj) => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
    } catch {
      // クライアント切断時の write 失敗は無視
    }
  };
  const safeClose = async () => {
    try { await writer.close(); } catch { /* already closed / aborted */ }
  };

  context.waitUntil(
    (async () => {
      try {
        await send({ type: "start", topic: topic.text, remaining: limit.remaining });

        const calls = ["claude", "chatgpt", "gemini"].map((p) =>
          callProvider(env, p, topic.text, abort.signal)
            .then((text) => send({ type: "response", provider: p, text }))
            .catch(() => send({ type: "response", provider: p, text: "（応答取得に失敗しました）", error: true }))
        );
        await Promise.all(calls);

        await send({ type: "done" });
      } finally {
        await safeClose();
      }
    })()
  );

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Content-Type-Options": "nosniff",
      "X-Accel-Buffering": "no",
    },
  });
}
