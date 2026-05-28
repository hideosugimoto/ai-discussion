#!/usr/bin/env node
// Polls each provider's /v1/models endpoint and reports models that aren't yet
// declared in src/models.config.js. Designed to run from a GitHub Actions
// scheduled workflow; emits a markdown report on stdout when something new
// shows up so the workflow can pipe it into `gh issue create`.
//
// Exit codes:
//   0  no new models found (or dry-run)
//   2  new models found (report on stdout)
//   1  unexpected error
//
// Env:
//   ANTHROPIC_API_KEY  Anthropic — optional; provider is skipped when absent
//   OPENAI_API_KEY     OpenAI    — optional
//   GOOGLE_AI_API_KEY  Google    — optional

import { MODEL_PRICING, VALIDATION_MODELS } from "../src/models.config.js";

const FAMILIES = {
  anthropic: { prefix: ["claude-"], label: "Anthropic" },
  openai:    { prefix: ["gpt-"],    label: "OpenAI"    },
  google:    { prefix: ["gemini-", "models/gemini-"], label: "Google" },
};

function knownIds() {
  const fromPricing    = Object.keys(MODEL_PRICING);
  const fromValidation = Object.values(VALIDATION_MODELS);
  return new Set([...fromPricing, ...fromValidation]);
}

function familyOf(id) {
  for (const [name, { prefix }] of Object.entries(FAMILIES)) {
    if (prefix.some((p) => id.startsWith(p))) return name;
  }
  return null;
}

// Strip Google's "models/" prefix so we compare against the same form used in
// src/models.config.js (e.g. "gemini-2.5-pro").
function normalizeId(provider, id) {
  if (provider === "google" && id.startsWith("models/")) return id.slice("models/".length);
  return id;
}

async function fetchAnthropic(apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text().catch(() => "")}`);
  const json = await res.json();
  return (json.data || []).map((m) => m.id).filter(Boolean);
}

async function fetchOpenAI(apiKey) {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text().catch(() => "")}`);
  const json = await res.json();
  return (json.data || []).map((m) => m.id).filter(Boolean);
}

async function fetchGoogle(apiKey) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`);
  if (!res.ok) throw new Error(`Google ${res.status}: ${await res.text().catch(() => "")}`);
  const json = await res.json();
  return (json.models || []).map((m) => m.name).filter(Boolean);
}

const FETCHERS = {
  anthropic: { envKey: "ANTHROPIC_API_KEY", fn: fetchAnthropic },
  openai:    { envKey: "OPENAI_API_KEY",    fn: fetchOpenAI    },
  google:    { envKey: "GOOGLE_AI_API_KEY", fn: fetchGoogle    },
};

async function collectUnknown() {
  const known = knownIds();
  const result = { unknown: {}, skipped: [], errors: [] };

  for (const [provider, { envKey, fn }] of Object.entries(FETCHERS)) {
    const apiKey = process.env[envKey];
    if (!apiKey) {
      result.skipped.push({ provider, reason: `${envKey} not set` });
      continue;
    }
    try {
      const raw = await fn(apiKey);
      const ids = raw.map((id) => normalizeId(provider, id));
      const unknown = ids
        .filter((id) => familyOf(id) === provider)
        .filter((id) => !known.has(id))
        // Drop dated snapshots if the base model is already known (e.g.
        // "gpt-5.4-2026-01" when "gpt-5.4" is known) — they're variants, not
        // the model launch we care about.
        .filter((id) => ![...known].some((k) => id.startsWith(k + "-") || id.startsWith(k + ":")));
      if (unknown.length) result.unknown[provider] = unknown.sort();
    } catch (e) {
      result.errors.push({ provider, message: e.message });
    }
  }
  return result;
}

function buildReport(result) {
  const sections = [];
  for (const [provider, ids] of Object.entries(result.unknown)) {
    const label = FAMILIES[provider].label;
    sections.push(`### ${label}\n` + ids.map((id) => `- \`${id}\``).join("\n"));
  }

  const footer = [];
  if (result.skipped.length) {
    footer.push("**スキップ:** " + result.skipped.map((s) => `${s.provider} (${s.reason})`).join(", "));
  }
  if (result.errors.length) {
    footer.push("**エラー:**\n" + result.errors.map((e) => `- ${e.provider}: ${e.message}`).join("\n"));
  }

  const body = [
    "## 未登録のモデルを検出しました",
    "",
    "以下のモデルが各社のAPIで提供されていますが、`src/models.config.js` に登録されていません。",
    "新しい主力モデルであれば `MODEL_PRICING` / `MODE_MODELS` / `VALIDATION_MODELS` を更新してください。",
    "価格・推奨マッピングは公式ドキュメントで確認すること。",
    "",
    ...sections,
    "",
    ...footer,
  ].filter(Boolean).join("\n");

  return body;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");

  if (dryRun) {
    const known = [...knownIds()].sort();
    console.error(`[dry-run] known models in src/models.config.js: ${known.length}`);
    for (const id of known) console.error(`  - ${id}`);
    return 0;
  }

  const result = await collectUnknown();

  // Always print machine-readable JSON to stderr so workflows can inspect it
  console.error(JSON.stringify(result, null, 2));

  const hasNew = Object.keys(result.unknown).length > 0;
  if (!hasNew) {
    console.error("[check-models] no new models");
    return 0;
  }

  // stdout is the issue body (workflow pipes this into `gh issue create`)
  console.log(buildReport(result));
  return 2;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error("[check-models] unexpected error:", e);
  process.exit(1);
});
