import { describe, it, expect } from "vitest";
import { deriveCard, glyphTextFor, buildHtml, OG_LABELS } from "../../functions/og/_card.js";

describe("deriveCard", () => {
  it("falls back to a default topic and zero counts on empty input", () => {
    const c = deriveCard("", "");
    expect(c.topic).toBe("AIディスカッション");
    expect(c).toMatchObject({ agree: 0, conflict: 0, unresolved: 0, rounds: 0 });
  });

  it("derives counts from the LAST summary and rounds from discussion length", () => {
    const dataJson = JSON.stringify({
      discussion: [{}, {}, {}],
      summaries: [
        { agreements: [1], disagreements: [1, 2], unresolved: [1] },
        { agreements: [1, 2, 3], disagreements: [1], unresolved: [1, 2] },
      ],
    });
    const c = deriveCard("段階導入か一括導入か", dataJson);
    expect(c).toMatchObject({ agree: 3, conflict: 1, unresolved: 2, rounds: 3 });
  });

  it("treats an errored last summary as zero counts", () => {
    const dataJson = JSON.stringify({ discussion: [{}], summaries: [{ error: "failed" }] });
    const c = deriveCard("x", dataJson);
    expect(c).toMatchObject({ agree: 0, conflict: 0, unresolved: 0, rounds: 1 });
  });

  it("keeps zeros on malformed JSON", () => {
    const c = deriveCard("x", "{not json");
    expect(c).toMatchObject({ agree: 0, conflict: 0, unresolved: 0, rounds: 0 });
  });

  it("truncates an over-long topic to 64 chars", () => {
    const long = "あ".repeat(200);
    expect(deriveCard(long, "{}").topic.length).toBe(64);
  });
});

describe("glyphTextFor", () => {
  it("covers every rendered label glyph plus digits and the topic", () => {
    const card = deriveCard("リモートか出社か", "{}");
    const g = glyphTextFor(card);
    // Every label's characters must be present so the font subset never tofus.
    for (const label of Object.values(OG_LABELS)) {
      for (const ch of label) expect(g).toContain(ch);
    }
    expect(g).toContain("0123456789");
    for (const ch of "リモートか出社か") expect(g).toContain(ch);
  });
});

describe("buildHtml", () => {
  it("escapes the topic so it cannot inject markup into the satori tree", () => {
    const card = deriveCard("<script>alert(1)</script>", "{}");
    const html = buildHtml(card);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the counts next to their labels", () => {
    const card = { topic: "T", agree: 5, conflict: 2, unresolved: 1, rounds: 4 };
    const html = buildHtml(card);
    expect(html).toContain(`${OG_LABELS.agree} 5`);
    expect(html).toContain(`${OG_LABELS.conflict} 2`);
    expect(html).toContain(`${OG_LABELS.unresolved} 1`);
    expect(html).toContain(`4 ${OG_LABELS.rounds}`);
  });
});
