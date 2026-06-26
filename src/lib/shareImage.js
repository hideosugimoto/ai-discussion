// Renders a shareable "結論カード" PNG entirely on a <canvas> (no html2canvas,
// no external fonts → no tainting). 1200×630 = OGP ratio for SNS link previews.

const W = 1200, H = 630, PAD = 64;

// Word-wrap by measuring; works for Japanese (per-character) and spaced text.
function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const ch of (text || "")) {
    if (ch === "\n") { lines.push(line); line = ""; continue; }
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = ch; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

const SANS = "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif";

// data: { topic, recommendation, agree, conflict, unresolved, confidence }
export function drawConsensusImage(canvas, data) {
  const dpr = 2;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = "#1a1814";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#242018";
  ctx.fillRect(0, 0, W, 8);
  ctx.fillStyle = "#7c3aed";
  ctx.fillRect(0, 0, 400, 8);

  // Brand row
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#8c8478";
  ctx.font = `600 22px ${SANS}`;
  ctx.fillText("3 AI Discussion — Claude / ChatGPT / Gemini", PAD, 80);

  // Topic (eyebrow)
  ctx.fillStyle = "#b8af9a";
  ctx.font = `500 26px ${SANS}`;
  const topicLines = wrap(ctx, data.topic || "", W - PAD * 2).slice(0, 2);
  let y = 132;
  for (const l of topicLines) { ctx.fillText(l, PAD, y); y += 38; }

  // Recommendation (hero)
  ctx.fillStyle = "#f0ece4";
  ctx.font = `700 44px ${SANS}`;
  const recLines = wrap(ctx, data.recommendation || "（議論の結論）", W - PAD * 2);
  const maxLines = 5;
  const shown = recLines.slice(0, maxLines);
  y = Math.max(y + 24, 230);
  for (let i = 0; i < shown.length; i++) {
    let line = shown[i];
    if (i === maxLines - 1 && recLines.length > maxLines) line = line.slice(0, -1) + "…";
    ctx.fillText(line, PAD, y);
    y += 60;
  }

  // Counts row (bottom)
  const by = H - 70;
  const chip = (x, color, label) => {
    ctx.font = `700 30px ${SANS}`;
    ctx.fillStyle = color;
    ctx.fillText(label, x, by);
    return x + ctx.measureText(label).width + 36;
  };
  let x = PAD;
  x = chip(x, "#4a9068", `🤝 合意 ${data.agree ?? 0}`);
  x = chip(x, "#ef4444", `⚔️ 対立 ${data.conflict ?? 0}`);
  x = chip(x, "#d4922a", `❓ 未解決 ${data.unresolved ?? 0}`);

  // Confidence (right)
  if (data.confidence) {
    const map = { high: ["確信度 高", "#4a9068"], medium: ["確信度 中", "#d4922a"], low: ["確信度 低", "#8c8478"] };
    const [t, c] = map[data.confidence] || map.medium;
    ctx.font = `700 26px ${SANS}`;
    ctx.fillStyle = c;
    ctx.textAlign = "right";
    ctx.fillText(t, W - PAD, by);
    ctx.textAlign = "left";
  }

  return canvas;
}

export function downloadCanvasPng(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "ai-discussion.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}
