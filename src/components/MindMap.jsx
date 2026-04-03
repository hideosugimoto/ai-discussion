import { useEffect, useState } from "react";

let mermaidLoading = null;

function loadMermaid() {
  if (window.mermaid) return Promise.resolve(window.mermaid);
  if (mermaidLoading) return mermaidLoading;
  mermaidLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
    script.onload = () => {
      window.mermaid.initialize({ startOnLoad: false, theme: "dark" });
      resolve(window.mermaid);
    };
    script.onerror = () => reject(new Error("mermaid.js の読み込みに失敗"));
    document.head.appendChild(script);
  });
  return mermaidLoading;
}

function escapeQuote(s) {
  return (s || "").replace(/"/g, "'").replace(/\n/g, " ").slice(0, 40);
}

function buildMermaidSyntax(summary) {
  const lines = ["mindmap", "  root((議論))"];

  if (summary.agreements?.length) {
    lines.push("    合意点");
    summary.agreements.forEach((item) => lines.push(`      "${escapeQuote(item.point)}"`));
  }
  if (summary.disagreements?.length) {
    lines.push("    対立点");
    summary.disagreements.forEach((item) => lines.push(`      "${escapeQuote(item.point)}"`));
  }
  if (summary.unresolved?.length) {
    lines.push("    未解決");
    summary.unresolved.forEach((item) => lines.push(`      "${escapeQuote(item.point)}"`));
  }
  if (summary.positionChanges?.length) {
    lines.push("    立場変化");
    summary.positionChanges.forEach((c) => lines.push(`      "${escapeQuote(c.ai + ': ' + c.description)}"`));
  }

  return lines.join("\n");
}

let renderCounter = 0;

export default function MindMap({ summary }) {
  const [svgHtml, setSvgHtml] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!summary) return;
    setError(null);
    setLoading(true);
    setSvgHtml(null);

    let cancelled = false;

    (async () => {
      try {
        const mermaid = await loadMermaid();
        if (cancelled) return;
        const diagram = buildMermaidSyntax(summary);
        const id = `mindmap-${++renderCounter}`;
        const { svg } = await mermaid.render(id, diagram);
        if (!cancelled) setSvgHtml(svg);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [summary]);

  if (!summary) {
    return <div style={{ padding:14, color:"#ffffff30", animation:"pulse 1.2s infinite" }}>読み込み中...</div>;
  }
  if (error) {
    return <div style={{ padding:14, color:"#ef4444", fontSize:13 }}>⚠ {error}</div>;
  }
  if (loading || !svgHtml) {
    return <div style={{ padding:14, color:"#ffffff30", animation:"pulse 1.2s infinite" }}>マップ生成中...</div>;
  }
  return <div style={{ padding:8, overflow:"auto" }} dangerouslySetInnerHTML={{ __html: svgHtml }} />;
}
