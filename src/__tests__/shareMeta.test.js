import { describe, it, expect } from "vitest";
import { escapeHtmlAttr, buildShareMeta, shareMetaTagsHtml } from "../../functions/api/share/_lib.js";

describe("escapeHtmlAttr", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtmlAttr(`<a href="x" o='y'>&`)).toBe("&lt;a href=&quot;x&quot; o=&#39;y&#39;&gt;&amp;");
  });
  it("handles null/undefined", () => {
    expect(escapeHtmlAttr(null)).toBe("");
    expect(escapeHtmlAttr(undefined)).toBe("");
  });
});

describe("buildShareMeta", () => {
  const origin = "https://example.com";
  const id = "abcdefghij0123456789AB";

  it("uses the topic in the title and builds the share url + image", () => {
    const m = buildShareMeta("リモートか出社か", "{}", origin, id);
    expect(m.title).toBe("リモートか出社か｜3 AI Discussion");
    expect(m.url).toBe(`${origin}/?share=${id}`);
    expect(m.image).toBe(`${origin}/og/${id}.png`);
  });

  it("derives counts from the last summary", () => {
    const dataJson = JSON.stringify({
      discussion: [{}, {}],
      summaries: [
        { agreements: [1], disagreements: [1, 2], unresolved: [] },
        { agreements: [1, 2], disagreements: [], unresolved: [1] },
      ],
    });
    const m = buildShareMeta("議題", dataJson, origin, id);
    expect(m.description).toBe("3つのAIが2ラウンド議論。合意2・対立0・未解決1点を整理しました。");
  });

  it("falls back to a generic description on bad json", () => {
    const m = buildShareMeta("議題", "not json", origin, id);
    expect(m.description).toContain("Claude・ChatGPT・Gemini");
  });

  it("falls back to a default topic when missing", () => {
    expect(buildShareMeta("", "{}", origin, id).title).toBe("AIディスカッション｜3 AI Discussion");
  });
});

describe("shareMetaTagsHtml", () => {
  it("emits escaped og + twitter tags (no XSS)", () => {
    const html = shareMetaTagsHtml(buildShareMeta(`"><script>alert(1)</script>`, "{}", "https://e.com", "abcdefghij0123456789AB"));
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("emits og:image dimensions and alt text for large-card previews + a11y", () => {
    const html = shareMetaTagsHtml(buildShareMeta("リモートか出社か", "{}", "https://e.com", "abcdefghij0123456789AB"));
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    expect(html).toContain('property="og:image:alt"');
    expect(html).toContain('name="twitter:image:alt"');
    expect(html).toContain("リモートか出社か — 3つのAIによる議論の結論カード");
  });
});
