import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

// Configure once: GFM tables, single-newline line breaks (AI output relies on
// soft line breaks), no header-id injection (avoids cross-message id clashes).
marked.setOptions({ gfm: true, breaks: true, headerIds: false, mangle: false });

// Open links in a new tab + add rel for safety. DOMPurify strips target/rel by
// default behaviour differences across browsers, so re-apply on the hook.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

// Confidence labels the AIs emit in search / fact-check modes. Rendering them as
// colored chips makes claim reliability glanceable — the kind of verifiability
// a single-answer orchestrator can't surface. Static spans, injected before
// sanitize so DOMPurify keeps them.
const CONF_BADGES = [
  { token: "【確実】",   cls: "conf-sure" },
  { token: "【候補】",   cls: "conf-maybe" },
  { token: "【要確認】", cls: "conf-check" },
  { token: "【推測】",   cls: "conf-guess" },
];

function injectConfidenceBadges(html) {
  let out = html;
  for (const { token, cls } of CONF_BADGES) {
    out = out.split(token).join(`<span class="conf-badge ${cls}">${token}</span>`);
  }
  return out;
}

// Renders a markdown string to sanitized HTML. Memoized on the source text so a
// re-render with identical text does no parsing work. Use for final (non-
// streaming) AI output; stream partial text as plain pre-wrap to avoid
// re-parsing on every chunk.
export default function Markdown({ text }) {
  const html = useMemo(() => {
    const raw = injectConfidenceBadges(marked.parse(text || ""));
    return DOMPurify.sanitize(raw);
  }, [text]);

  return <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
