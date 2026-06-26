import { MODELS } from "./constants";
import { marked } from "marked";
import DOMPurify from "dompurify";

function sanitize(text) {
  return (text || "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

// Japanese labels for confidence / stress-test outcome, shared by MD + HTML.
const CONF_JA = { high: "高", medium: "中", low: "低" };
const SURVIVE_JA = { yes: "主要な反論に耐えた", partial: "条件付きで成立（要補強）", no: "反論で覆る可能性" };

// ── Decision layer (Markdown) ───────────────────────────────────
// The verdict + action plan are the multi-AI "deliverable"; we surface them at
// the TOP of the export so the decisive output isn't buried under the rounds.
function verdictMarkdown(verdict) {
  if (!verdict || verdict.error || !verdict.recommendation) return [];
  const L = [`## 🏛️ 最終ジャッジ（裁定）`];
  L.push(`**結論（確信度: ${CONF_JA[verdict.confidence] || "中"}）:** ${sanitize(verdict.recommendation)}`);
  if (verdict.resolved?.length) {
    L.push(`**対立点ごとの判定:**`);
    verdict.resolved.forEach((r) => L.push(`- ${sanitize(r.point)} → ${sanitize(r.verdict)}（確度: ${CONF_JA[r.confidence] || "中"}）${r.reason ? ` ／ 根拠: ${sanitize(r.reason)}` : ""}`));
  }
  if (verdict.caveats?.length) {
    L.push(`**この結論が崩れる条件:**`);
    verdict.caveats.forEach((c) => L.push(`- ${sanitize(c)}`));
  }
  if (verdict.critique?.survives) {
    L.push(`**反対意見ストレステスト:** ${SURVIVE_JA[verdict.critique.survives] || ""}`);
    if (verdict.critique.strongestObjection) L.push(`- 最強の反論: ${sanitize(verdict.critique.strongestObjection)}`);
    if (verdict.critique.fix) L.push(`- 補強: ${sanitize(verdict.critique.fix)}`);
  }
  if (verdict.decisionHint) L.push(`**最終判断はあなた（確認すべき1点）:** ${sanitize(verdict.decisionHint)}`);
  L.push("");
  return L;
}

function actionPlanMarkdown(plan) {
  if (!plan || (!plan.conclusion && !plan.actions?.length)) return [];
  const L = [`## ✅ アクションプラン`];
  if (plan.conclusion) L.push(`**結論:** ${sanitize(plan.conclusion)}`);
  if (plan.actions?.length) {
    L.push(`**アクション:**`);
    plan.actions.forEach((a) => L.push(`- [${CONF_JA[a.priority] || sanitize(a.priority)}] ${sanitize(a.task)}（${sanitize(a.timeframe)}）${a.rationale ? ` — ${sanitize(a.rationale)}` : ""}`));
  }
  if (plan.risks?.length) {
    L.push(`**リスク:**`);
    plan.risks.forEach((r) => L.push(`- ${sanitize(r)}`));
  }
  if (plan.nextQuestion) L.push(`**次に議論すべき:** ${sanitize(plan.nextQuestion)}`);
  L.push("");
  return L;
}

// ── Decision layer (HTML) ───────────────────────────────────────
function verdictHtml(verdict) {
  if (!verdict || verdict.error || !verdict.recommendation) return "";
  const parts = [
    `<div style="font-size:15px;font-weight:700;color:#5b21b6;margin-bottom:8px">🏛️ 最終ジャッジ（裁定）<span style="font-size:12px;font-weight:600;color:#7c3aed;margin-left:8px">確信度: ${CONF_JA[verdict.confidence] || "中"}</span></div>`,
    `<div style="font-size:14px;font-weight:600;line-height:1.7;color:#222;margin-bottom:10px">${sanitizeHtml(verdict.recommendation)}</div>`,
  ];
  if (verdict.resolved?.length) {
    parts.push(`<div style="margin-bottom:8px"><strong style="color:#5b21b6;font-size:13px">⚖️ 対立点ごとの判定:</strong><ul style="margin:4px 0">${verdict.resolved.map((r) => `<li><strong>${sanitizeHtml(r.point)}</strong> → ${sanitizeHtml(r.verdict)} <span style="color:#888">（確度: ${CONF_JA[r.confidence] || "中"}）</span>${r.reason ? `<br><span style="color:#666;font-size:12px">根拠: ${sanitizeHtml(r.reason)}</span>` : ""}</li>`).join("")}</ul></div>`);
  }
  if (verdict.caveats?.length) {
    parts.push(`<div style="margin-bottom:8px"><strong style="color:#ca8a04;font-size:13px">⚠ この結論が崩れる条件:</strong><ul style="margin:4px 0">${verdict.caveats.map((c) => `<li>${sanitizeHtml(c)}</li>`).join("")}</ul></div>`);
  }
  if (verdict.critique?.survives) {
    parts.push(`<div style="margin-bottom:8px"><strong style="font-size:13px">🧪 反対意見ストレステスト:</strong> ${sanitizeHtml(SURVIVE_JA[verdict.critique.survives] || "")}${verdict.critique.strongestObjection ? `<br><span style="color:#666;font-size:12px">最強の反論: ${sanitizeHtml(verdict.critique.strongestObjection)}</span>` : ""}${verdict.critique.fix ? `<br><span style="color:#666;font-size:12px">補強: ${sanitizeHtml(verdict.critique.fix)}</span>` : ""}</div>`);
  }
  if (verdict.decisionHint) {
    parts.push(`<div style="margin-top:8px;font-size:13px;color:#333">🧑‍⚖️ <strong>最終判断はあなた:</strong> ${sanitizeHtml(verdict.decisionHint)}</div>`);
  }
  return `<section style="background:#faf7ff;border:2px solid #7c3aed;border-radius:10px;padding:16px;margin-bottom:20px">${parts.join("")}</section>`;
}

function actionPlanHtml(plan) {
  if (!plan || (!plan.conclusion && !plan.actions?.length)) return "";
  const parts = [`<div style="font-size:15px;font-weight:700;color:#166534;margin-bottom:8px">✅ アクションプラン</div>`];
  if (plan.conclusion) parts.push(`<div style="font-size:13px;color:#333;margin-bottom:8px">💡 ${sanitizeHtml(plan.conclusion)}</div>`);
  if (plan.actions?.length) parts.push(`<div style="margin-bottom:8px"><strong style="font-size:13px">アクション:</strong><ul style="margin:4px 0">${plan.actions.map((a) => `<li>[${CONF_JA[a.priority] || sanitizeHtml(a.priority)}] ${sanitizeHtml(a.task)} <span style="color:#888">（${sanitizeHtml(a.timeframe)}）</span>${a.rationale ? `<br><span style="color:#666;font-size:12px">${sanitizeHtml(a.rationale)}</span>` : ""}</li>`).join("")}</ul></div>`);
  if (plan.risks?.length) parts.push(`<div style="margin-bottom:8px"><strong style="color:#b91c1c;font-size:13px">リスク:</strong><ul style="margin:4px 0">${plan.risks.map((r) => `<li>${sanitizeHtml(r)}</li>`).join("")}</ul></div>`);
  if (plan.nextQuestion) parts.push(`<div style="font-size:13px;color:#333">🔮 <strong>次に議論すべき:</strong> ${sanitizeHtml(plan.nextQuestion)}</div>`);
  return `<section style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:20px">${parts.join("")}</section>`;
}

export function exportToMarkdown(topic, discussion, summaries, personas, verdict, actionPlan) {
  const lines = [];
  lines.push(`# 3 AI Discussion`);
  lines.push(`**議題:** ${sanitize(topic)}`);
  lines.push(`**日時:** ${new Date().toLocaleString("ja-JP")}`);
  lines.push(`**ラウンド数:** ${discussion.length}`);
  lines.push("");

  // Decision layer first (verdict + action plan), then the round-by-round log.
  lines.push(...verdictMarkdown(verdict));
  lines.push(...actionPlanMarkdown(actionPlan));

  discussion.forEach((round, i) => {
    lines.push(`---`);
    lines.push(`## Round ${i + 1}`);
    if (round.userIntervention) {
      lines.push(`> 💬 **司会者:** ${sanitize(round.userIntervention)}`);
      lines.push("");
    }

    round.messages.forEach((msg) => {
      const model = MODELS.find((m) => m.id === msg.modelId);
      const name = model?.name ?? msg.modelId;
      const icon = model?.icon ?? "?";
      const persona = personas?.[msg.modelId];
      lines.push(`### ${icon} ${name}${persona ? `（${sanitize(persona)}）` : ""}`);
      if (msg.error) {
        lines.push(`*エラー: ${sanitize(msg.error)}*`);
      } else {
        lines.push(sanitize(msg.text));
      }
      lines.push("");
    });

    const summary = summaries[i];
    if (summary && !summary.error) {
      lines.push(`### 📊 サマリー`);
      if (summary.agreements?.length) {
        lines.push(`**合意点:**`);
        summary.agreements.forEach((a) => lines.push(`- ${sanitize(a.point)}`));
      }
      if (summary.disagreements?.length) {
        lines.push(`**対立点:**`);
        summary.disagreements.forEach((d) => lines.push(`- ${sanitize(d.point)}`));
      }
      if (summary.unresolved?.length) {
        lines.push(`**未解決:**`);
        summary.unresolved.forEach((u) => lines.push(`- ${sanitize(u.point)}`));
      }
      if (summary.positionChanges?.length) {
        lines.push(`**立場変化:**`);
        summary.positionChanges.forEach((p) => lines.push(`- ${sanitize(p.ai)}: ${sanitize(p.description)}`));
      }
      lines.push("");
    }
  });

  lines.push(`---`);
  lines.push(`*Generated by [3 AI Discussion](https://github.com/hideosugimoto/ai-discussion)*`);

  return lines.join("\n");
}

// ── HTML Export ───────────────────────────────────────────────

const AI_COLORS_STATIC = { claude: "#c47b1a", chatgpt: "#285240", gemini: "#2e7db8" };

function sanitizeHtml(text) {
  return (text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Render an AI message (markdown) to sanitized HTML for the export document, so
// headings/lists/tables/bold match the in-app rendering instead of dumping raw
// "##" / "**" markers into the file.
function renderMarkdownHtml(text) {
  const raw = marked.parse(text || "");
  return DOMPurify.sanitize(raw);
}

export function exportToHtml(topic, discussion, summaries, personas, verdict, actionPlan) {
  const rounds = discussion.map((round, i) => {
    const intervention = round.userIntervention
      ? `<div style="background:#f0f4ff;border-left:3px solid #7c3aed;padding:8px 14px;margin-bottom:16px;border-radius:0 8px 8px 0;font-size:13px;color:#555">💬 <strong>司会者:</strong> ${sanitizeHtml(round.userIntervention)}</div>`
      : "";

    const messages = round.messages.map((msg) => {
      const model = MODELS.find((m) => m.id === msg.modelId);
      const name = model?.name ?? msg.modelId;
      const icon = model?.icon ?? "?";
      const color = AI_COLORS_STATIC[msg.modelId] || "#666";
      const content = msg.error
        ? `<span style="color:#b91c1c">⚠ ${sanitizeHtml(msg.error)}</span>`
        : `<div class="md-body">${renderMarkdownHtml(msg.text)}</div>`;
      const persona = personas?.[msg.modelId];
      const displayName = persona ? `${name}（${sanitizeHtml(persona)}）` : name;
      return `<div style="border-left:3px solid ${color};padding:12px 16px;margin-bottom:12px;background:#fafafa;border-radius:0 8px 8px 0">
        <div style="font-weight:600;color:${color};margin-bottom:6px;font-size:14px">${icon} ${displayName}</div>
        <div style="font-size:13px;line-height:1.8;color:#333">${content}</div>
      </div>`;
    }).join("");

    const summary = summaries[i];
    let summaryHtml = "";
    if (summary && !summary.error) {
      const sections = [];
      if (summary.agreements?.length) {
        sections.push(`<div style="margin-bottom:8px"><strong style="color:#16a34a">合意点:</strong><ul style="margin:4px 0">${summary.agreements.map((a) => `<li>${sanitizeHtml(a.point)}</li>`).join("")}</ul></div>`);
      }
      if (summary.disagreements?.length) {
        sections.push(`<div style="margin-bottom:8px"><strong style="color:#b91c1c">対立点:</strong><ul style="margin:4px 0">${summary.disagreements.map((d) => `<li>${sanitizeHtml(d.point)}</li>`).join("")}</ul></div>`);
      }
      if (summary.unresolved?.length) {
        sections.push(`<div style="margin-bottom:8px"><strong style="color:#ca8a04">未解決:</strong><ul style="margin:4px 0">${summary.unresolved.map((u) => `<li>${sanitizeHtml(u.point)}</li>`).join("")}</ul></div>`);
      }
      if (summary.positionChanges?.length) {
        sections.push(`<div style="margin-bottom:8px"><strong style="color:#7c3aed">立場変化:</strong><ul style="margin:4px 0">${summary.positionChanges.map((p) => `<li>${sanitizeHtml(p.ai)}: ${sanitizeHtml(p.description)}</li>`).join("")}</ul></div>`);
      }
      if (sections.length) {
        summaryHtml = `<div style="background:#f8f5ff;border:1px solid #e0d8f0;border-radius:8px;padding:14px;margin-top:8px">
          <div style="font-weight:600;margin-bottom:8px;font-size:13px">📊 サマリー</div>
          ${sections.join("")}
        </div>`;
      }
    }

    return `<section style="margin-bottom:32px">
      <h2 style="font-size:16px;color:#444;border-bottom:1px solid #e0e0e0;padding-bottom:8px;margin-bottom:16px">Round ${i + 1}</h2>
      ${intervention}${messages}${summaryHtml}
    </section>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>3 AI Discussion - ${sanitizeHtml(topic)}</title>
<style>
  body { font-family: -apple-system, 'Noto Sans JP', sans-serif; max-width: 800px; margin: 0 auto; padding: 24px 16px; background: #fff; color: #333; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { font-size: 12px; color: #888; margin-bottom: 24px; }
  .md-body > :first-child { margin-top: 0; }
  .md-body > :last-child { margin-bottom: 0; }
  .md-body p { margin: 0 0 8px; }
  .md-body h1, .md-body h2, .md-body h3, .md-body h4 { margin: 12px 0 6px; line-height: 1.35; }
  .md-body h2 { font-size: 1.1em; border-bottom: 1px solid #eee; padding-bottom: 3px; }
  .md-body ul, .md-body ol { margin: 4px 0 8px; padding-left: 1.4em; }
  .md-body li { margin: 2px 0; }
  .md-body code { font-family: ui-monospace, Menlo, monospace; font-size: .9em; background: #f3f3f3; border-radius: 4px; padding: 1px 5px; }
  .md-body pre { background: #f6f6f6; border: 1px solid #e5e5e5; border-radius: 6px; padding: 10px; overflow-x: auto; }
  .md-body pre code { background: none; padding: 0; }
  .md-body blockquote { margin: 6px 0; padding: 2px 12px; border-left: 3px solid #ddd; color: #666; }
  .md-body table { border-collapse: collapse; margin: 8px 0; font-size: .95em; }
  .md-body th, .md-body td { border: 1px solid #ddd; padding: 5px 10px; text-align: left; }
  .md-body th { background: #f3f3f3; }
  @media print { body { max-width: 100%; } }
</style>
</head>
<body>
<h1>3 AI Discussion</h1>
<div style="font-size:15px;font-weight:600;color:#222;margin-bottom:4px">議題: ${sanitizeHtml(topic)}</div>
<div class="meta">${new Date().toLocaleString("ja-JP")} · ${discussion.length}ラウンド</div>
${verdictHtml(verdict)}${actionPlanHtml(actionPlan)}${rounds}
<footer style="border-top:1px solid #e0e0e0;padding-top:12px;margin-top:24px;font-size:11px;color:#aaa">
  Generated by <a href="https://github.com/hideosugimoto/ai-discussion" style="color:#7c3aed">3 AI Discussion</a>
</footer>
</body>
</html>`;
}

function buildFileName(topic, ext) {
  const cleaned = (topic || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/[\s\u3000]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .trim();
  const base = cleaned.slice(0, 40) || "discussion";
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${base}_${date}.${ext}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadHtml(topic, discussion, summaries, personas, verdict, actionPlan) {
  const html = exportToHtml(topic, discussion, summaries, personas, verdict, actionPlan);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  triggerDownload(blob, buildFileName(topic, "html"));
}

export function downloadMarkdown(topic, discussion, summaries, personas, verdict, actionPlan) {
  const md = exportToMarkdown(topic, discussion, summaries, personas, verdict, actionPlan);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, buildFileName(topic, "md"));
}
