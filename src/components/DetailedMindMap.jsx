import { useEffect, useState } from "react";
import { loadMermaid } from "../lib/mermaidLoader";

function esc(text) {
  return (text || "").replace(/"/g, "'").replace(/\n/g, " ").slice(0, 35);
}

const AI_LABELS = { claude: "Claude", chatgpt: "ChatGPT", gemini: "Gemini" };

function buildDetailedMermaid(analysis) {
  const lines = ["mindmap", '  root(("議論の論点"))'];

  (analysis.themes || []).forEach((theme) => {
    lines.push(`    ["${esc(theme.name)}"]`);
    for (const key of ["claude", "chatgpt", "gemini"]) {
      const pos = theme.positions?.[key];
      if (!pos || pos.stance === "言及なし") continue;
      lines.push(`      ("${AI_LABELS[key]}: ${esc(pos.stance)}")`);
      if (pos.argument) {
        lines.push(`        "${esc(pos.argument)}"`);
      }
      if (pos.evidence) {
        lines.push(`        "${esc(pos.evidence)}"`);
      }
    }
  });

  if (analysis.consensus?.length) {
    lines.push('    ["合意"]');
    analysis.consensus.forEach((item) => lines.push(`      "${esc(item)}"`));
  }

  if (analysis.unresolved?.length) {
    lines.push('    ["未解決"]');
    analysis.unresolved.forEach((item) => lines.push(`      "${esc(item)}"`));
  }

  return lines.join("\n");
}

let detailedRenderCounter = 0;

export default function DetailedMindMap({ analysis }) {
  const [svgHtml, setSvgHtml] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!analysis) return;
    setSvgHtml(null);
    setError(null);
    setLoading(true);

    let cancelled = false;

    (async () => {
      try {
        const mermaid = await loadMermaid();
        if (cancelled) return;
        const diagram = buildDetailedMermaid(analysis);
        const id = `detailed-${++detailedRenderCounter}`;
        const { svg } = await mermaid.render(id, diagram);
        if (!cancelled) setSvgHtml(svg);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [analysis]);

  if (!analysis) {
    return <div style={{ padding:14, color:"var(--text3)", animation:"pulse 1.2s infinite" }}>詳細分析を実行中...</div>;
  }
  if (error) {
    return <div style={{ padding:14, color:"var(--error)", fontSize:13 }}>⚠ {error}</div>;
  }
  if (loading || !svgHtml) {
    return <div style={{ padding:14, color:"var(--text3)", animation:"pulse 1.2s infinite" }}>詳細マップ生成中...</div>;
  }
  return <div style={{ padding:8, overflow:"auto" }} dangerouslySetInnerHTML={{ __html: svgHtml }} />;
}
