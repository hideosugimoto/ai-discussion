import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import {
  applyMarkers,
  retiredDisplayLabels,
  TARGET_FILES,
} from "../../scripts/sync-model-displays.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Text surfaces that must never show a retired (no-longer-routed) model name.
function collectFiles(relDir, exts) {
  const abs = resolve(ROOT, relDir);
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (exts.some((e) => p.endsWith(e))) out.push(p);
    }
  };
  walk(abs);
  return out;
}

const SCAN_FILES = [
  ...TARGET_FILES.map((f) => resolve(ROOT, f)),
  // Exclude models.config.js: it is the definition site of MODEL_LABELS, so it
  // legitimately contains every label (active and retired).
  ...collectFiles("src", [".js", ".jsx"]).filter(
    (p) => !p.includes("__tests__") && !p.endsWith("models.config.js"),
  ),
  ...collectFiles("marketing", [".md"]),
];

describe("model display sync", () => {
  it.each(TARGET_FILES)("%s marked regions match models.config.js", (rel) => {
    const text = readFileSync(resolve(ROOT, rel), "utf8");
    // applyMarkers is a no-op only when every marked region already equals its
    // config-derived value. A diff here means a model was changed without
    // running `npm run sync:models`.
    expect(applyMarkers(text)).toBe(text);
  });

  it("no display surface contains a retired model name", () => {
    const retired = retiredDisplayLabels();
    const leaks = [];
    for (const abs of SCAN_FILES) {
      const text = readFileSync(abs, "utf8");
      for (const label of retired) {
        if (text.includes(label)) leaks.push(`${abs.replace(ROOT + "/", "")}: "${label}"`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("applyMarkers rewrites a marked region from config", () => {
    const out = applyMarkers(`x <!--M:best.chatgpt-->STALE<!--/M--> y`);
    expect(out).toContain("GPT-5.6 Sol");
    expect(out).not.toContain("STALE");
  });
});
