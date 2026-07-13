#!/usr/bin/env node
// Keeps on-screen model names in static files (public/lp.html, README.md) in
// sync with the single source of truth (src/models.config.js).
//
// Marked regions look like:  <!--M:KEY-->displayed text<!--/M-->
// and the KEY resolves against MODE_MODELS. The marker comments are inert
// HTML/Markdown comments, so the files stay directly usable; this script only
// rewrites the text *between* the markers.
//
// KEY grammar:
//   <mode>.<provider>          -> the model's display label   (e.g. best.chatgpt -> "GPT-5.6 Sol")
//   <mode>.<provider>:tag      -> the raw model tag           (e.g. best.chatgpt:tag -> "gpt-5.6-sol")
//   <mode>.<provider>:lower    -> label, lower-cased          (e.g. best.chatgpt:lower -> "gpt-5.6 sol")
//   summary.<mode>             -> "A / B / C" model summary    (e.g. summary.best)
//
// Usage:
//   node scripts/sync-model-displays.mjs           # rewrite files in place
//   node scripts/sync-model-displays.mjs --check   # exit 1 if any file is stale (no writes)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import {
  MODE_MODELS,
  MODEL_LABELS,
  SUMMARY_MODEL,
  VALIDATION_MODELS,
  labelFor,
  modeModelSummary,
} from "../src/models.config.js";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

export const TARGET_FILES = ["public/lp.html", "README.md"];

const MARKER_RE = /(<!--M:([\w.:-]+)-->)([\s\S]*?)(<!--\/M-->)/g;

function resolveKey(key) {
  const [base, mod] = key.split(":");
  let value;
  if (base.startsWith("summary.")) {
    value = modeModelSummary(base.slice("summary.".length));
  } else {
    const [mode, provider] = base.split(".");
    const cell = MODE_MODELS[mode]?.[provider];
    if (!cell) throw new Error(`sync-model-displays: unknown marker key "${key}"`);
    value = mod === "tag" ? cell.tag : cell.label;
  }
  if (mod === "lower") value = value.toLowerCase();
  return value;
}

// Pure: given file text, return it with every marked region refreshed.
export function applyMarkers(text) {
  return text.replace(MARKER_RE, (_m, open, key, _inner, close) => `${open}${resolveKey(key)}${close}`);
}

// Display labels for models that are priced/known but NOT currently routed
// anywhere (best/fast/summary/validation). These must never appear in a display
// file — a leftover here means a stale name. Labels that are a substring of an
// active label (e.g. "GPT-5.4" inside the active "GPT-5.4 mini") are dropped to
// avoid false positives.
export function retiredDisplayLabels() {
  const activeTags = new Set([
    ...Object.values(MODE_MODELS).flatMap((m) => Object.values(m).map((c) => c.tag)),
    SUMMARY_MODEL,
    ...Object.values(VALIDATION_MODELS),
  ]);
  const activeLabels = [...activeTags].map(labelFor);
  const retired = Object.keys(MODEL_LABELS)
    .filter((tag) => !activeTags.has(tag))
    .map(labelFor);
  return retired.filter((l) => !activeLabels.some((a) => a.includes(l)));
}

function main() {
  const check = process.argv.includes("--check");
  const stale = [];
  for (const rel of TARGET_FILES) {
    const abs = resolvePath(ROOT, rel);
    const before = readFileSync(abs, "utf8");
    const after = applyMarkers(before);
    if (before !== after) {
      stale.push(rel);
      if (!check) writeFileSync(abs, after);
    }
  }
  if (check) {
    if (stale.length) {
      console.error(`[sync-model-displays] stale (run \`npm run sync:models\`): ${stale.join(", ")}`);
      process.exit(1);
    }
    console.error("[sync-model-displays] all display files in sync");
  } else {
    console.error(stale.length ? `[sync-model-displays] updated: ${stale.join(", ")}` : "[sync-model-displays] no changes");
  }
}

// Only run when invoked as a script (not when imported by the test).
if (process.argv[1] && resolvePath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
