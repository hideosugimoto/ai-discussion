import { describe, it, expect } from "vitest";
import { compressHistory, buildPrompt } from "../prompt";

// Helper to create a mock round
function makeRound(messages) {
  return {
    messages: messages.map(([modelId, text]) => ({ modelId, text })),
  };
}

// Helper to create a mock summary with stances
function makeSummary({ agreements = [], disagreements = [], unresolved = [], stances = {} } = {}) {
  return {
    agreements: agreements.map((p) => ({ point: p })),
    disagreements: disagreements.map((p) => ({ point: p })),
    unresolved: unresolved.map((p) => ({ point: p })),
    positionChanges: [],
    stances,
  };
}

describe("compressHistory", () => {
  it("returns empty string for empty history", () => {
    expect(compressHistory([], [])).toBe("");
  });

  it("returns full text for history below MIN_ROUNDS_FOR_COMPRESSION", () => {
    const history = [
      makeRound([["claude", "Claudeの意見"], ["chatgpt", "GPTの意見"], ["gemini", "Geminiの意見"]]),
      makeRound([["claude", "Claude2回目"], ["chatgpt", "GPT2回目"], ["gemini", "Gemini2回目"]]),
      makeRound([["claude", "Claude3回目"], ["chatgpt", "GPT3回目"], ["gemini", "Gemini3回目"]]),
    ];
    const result = compressHistory(history, []);
    // Should contain all messages in full
    expect(result).toContain("Claudeの意見");
    expect(result).toContain("GPT2回目");
    expect(result).toContain("Gemini3回目");
    // Should NOT contain summary markers
    expect(result).not.toContain("要約");
  });

  it("compresses older rounds when history >= MIN_ROUNDS_FOR_COMPRESSION", () => {
    const history = [
      makeRound([["claude", "R1Claude"], ["chatgpt", "R1GPT"], ["gemini", "R1Gemini"]]),
      makeRound([["claude", "R2Claude"], ["chatgpt", "R2GPT"], ["gemini", "R2Gemini"]]),
      makeRound([["claude", "R3Claude"], ["chatgpt", "R3GPT"], ["gemini", "R3Gemini"]]),
      makeRound([["claude", "R4Claude"], ["chatgpt", "R4GPT"], ["gemini", "R4Gemini"]]),
    ];
    const summaries = [
      makeSummary({ agreements: ["R1合意点"], disagreements: ["R1対立点"] }),
      makeSummary({ agreements: ["R2合意点"], disagreements: ["R2対立点"] }),
      makeSummary({ agreements: ["R3合意点"] }),
      null, // current round - no summary yet
    ];
    const result = compressHistory(history, summaries);

    // Old rounds (1-2) should be summarized, not full text
    expect(result).not.toContain("R1Claude");
    expect(result).not.toContain("R2GPT");
    expect(result).toContain("R1合意点");
    expect(result).toContain("R2対立点");

    // Recent rounds (3-4) should be full text
    expect(result).toContain("R3Claude");
    expect(result).toContain("R4GPT");
    expect(result).toContain("R4Gemini");
  });

  it("includes stances in compressed output when available", () => {
    const history = Array.from({ length: 5 }, (_, i) =>
      makeRound([
        ["claude", `R${i + 1}Claude`],
        ["chatgpt", `R${i + 1}GPT`],
        ["gemini", `R${i + 1}Gemini`],
      ])
    );
    const summaries = [
      makeSummary({ agreements: ["A1"] }),
      makeSummary({
        agreements: ["A2"],
        stances: {
          claude: "リモートワーク推進派",
          chatgpt: "ハイブリッド推奨",
          gemini: "条件付き賛成",
        },
      }),
      makeSummary({ agreements: ["A3"], stances: { claude: "立場維持", chatgpt: "やや譲歩", gemini: "条件付き賛成" } }),
      null,
      null,
    ];
    const result = compressHistory(history, summaries);

    // Should include the latest stances from compressed rounds
    expect(result).toContain("立場");
  });

  it("falls back to full text when summary is null", () => {
    const history = [
      makeRound([["claude", "R1Claude"], ["chatgpt", "R1GPT"], ["gemini", "R1Gemini"]]),
      makeRound([["claude", "R2Claude"], ["chatgpt", "R2GPT"], ["gemini", "R2Gemini"]]),
      makeRound([["claude", "R3Claude"], ["chatgpt", "R3GPT"], ["gemini", "R3Gemini"]]),
      makeRound([["claude", "R4Claude"], ["chatgpt", "R4GPT"], ["gemini", "R4Gemini"]]),
    ];
    const summaries = [null, null, null, null];
    const result = compressHistory(history, summaries);

    // Fallback: old rounds should still appear as full text
    expect(result).toContain("R1Claude");
    expect(result).toContain("R2GPT");
  });

  it("falls back to full text when summary has error flag", () => {
    const history = [
      makeRound([["claude", "R1Claude"], ["chatgpt", "R1GPT"], ["gemini", "R1Gemini"]]),
      makeRound([["claude", "R2Claude"], ["chatgpt", "R2GPT"], ["gemini", "R2Gemini"]]),
      makeRound([["claude", "R3Claude"], ["chatgpt", "R3GPT"], ["gemini", "R3Gemini"]]),
      makeRound([["claude", "R4Claude"], ["chatgpt", "R4GPT"], ["gemini", "R4Gemini"]]),
    ];
    const summaries = [
      { error: true },
      makeSummary({ agreements: ["R2合意点"] }),
      null,
      null,
    ];
    const result = compressHistory(history, summaries);

    // Round 1 has error summary → fallback to full text
    expect(result).toContain("R1Claude");
    // Round 2 has valid summary → compressed
    expect(result).toContain("R2合意点");
    expect(result).not.toContain("R2Claude");
  });

  it("works when summaries array is undefined", () => {
    const history = [
      makeRound([["claude", "R1Claude"], ["chatgpt", "R1GPT"], ["gemini", "R1Gemini"]]),
      makeRound([["claude", "R2Claude"], ["chatgpt", "R2GPT"], ["gemini", "R2Gemini"]]),
      makeRound([["claude", "R3Claude"], ["chatgpt", "R3GPT"], ["gemini", "R3Gemini"]]),
      makeRound([["claude", "R4Claude"], ["chatgpt", "R4GPT"], ["gemini", "R4Gemini"]]),
    ];
    const result = compressHistory(history, undefined);

    // All rounds should be full text (no compression possible)
    expect(result).toContain("R1Claude");
    expect(result).toContain("R4Gemini");
  });

  it("handles personas in compressed output", () => {
    const history = [
      makeRound([["claude", "R1Claude"], ["chatgpt", "R1GPT"], ["gemini", "R1Gemini"]]),
      makeRound([["claude", "R2Claude"], ["chatgpt", "R2GPT"], ["gemini", "R2Gemini"]]),
      makeRound([["claude", "R3Claude"], ["chatgpt", "R3GPT"], ["gemini", "R3Gemini"]]),
      makeRound([["claude", "R4Claude"], ["chatgpt", "R4GPT"], ["gemini", "R4Gemini"]]),
    ];
    const summaries = [null, null, null, null]; // no summaries → full fallback
    const personas = { claude: "経済学者", chatgpt: "社会学者", gemini: "哲学者" };
    const result = compressHistory(history, summaries, personas);

    expect(result).toContain("経済学者");
    expect(result).toContain("社会学者");
  });

  it("recent full rounds section uses correct separator", () => {
    const history = [
      makeRound([["claude", "R1C"], ["chatgpt", "R1G"], ["gemini", "R1E"]]),
      makeRound([["claude", "R2C"], ["chatgpt", "R2G"], ["gemini", "R2E"]]),
      makeRound([["claude", "R3C"], ["chatgpt", "R3G"], ["gemini", "R3E"]]),
      makeRound([["claude", "R4C"], ["chatgpt", "R4G"], ["gemini", "R4E"]]),
    ];
    const summaries = [
      makeSummary({ agreements: ["A1"] }),
      makeSummary({ agreements: ["A2"] }),
      null,
      null,
    ];
    const result = compressHistory(history, summaries);

    // Recent rounds should be separated by ---
    expect(result).toContain("---");
    // Should have section headers
    expect(result).toContain("これまでの議論");
  });
});

describe("buildPrompt with summaries", () => {
  it("is backward compatible without summaries parameter", () => {
    const history = [
      makeRound([["claude", "Claudeの意見"], ["chatgpt", "GPTの意見"], ["gemini", "Geminiの意見"]]),
    ];
    // Old call signature without summaries
    const { user } = buildPrompt("claude", "テスト", "", history, 2, "");
    expect(user).toContain("Claudeの意見");
    expect(user).toContain("これまでの議論");
  });

  it("uses compressed history when summaries are provided and rounds >= 4", () => {
    const history = Array.from({ length: 5 }, (_, i) =>
      makeRound([
        ["claude", `R${i + 1}Claude`],
        ["chatgpt", `R${i + 1}GPT`],
        ["gemini", `R${i + 1}Gemini`],
      ])
    );
    const summaries = [
      makeSummary({ agreements: ["合意1"] }),
      makeSummary({ agreements: ["合意2"] }),
      makeSummary({ agreements: ["合意3"] }),
      null,
      null,
    ];
    const { user } = buildPrompt("claude", "テスト", "", history, 6, "", "standard", null, "", [], summaries);

    // Old rounds should be compressed
    expect(user).not.toContain("R1Claude");
    expect(user).toContain("合意1");

    // Recent rounds should be full text
    expect(user).toContain("R4Claude");
    expect(user).toContain("R5Gemini");
  });

  it("uses rolling summary when provided", () => {
    const history = Array.from({ length: 5 }, (_, i) =>
      makeRound([
        ["claude", `R${i + 1}Claude`],
        ["chatgpt", `R${i + 1}GPT`],
        ["gemini", `R${i + 1}Gemini`],
      ])
    );
    const rolling = {
      agreements: [{ point: "累積合意点" }],
      disagreements: [{ point: "累積対立点" }],
      unresolved: [],
      stances: {
        claude: "リモートワーク推進派",
        chatgpt: "ハイブリッド推奨",
        gemini: "条件付き賛成",
      },
    };
    const { user } = buildPrompt("claude", "テスト", "", history, 6, "", "standard", null, "", [], [], rolling);

    // Rolling summary should be used instead of per-round summaries
    expect(user).toContain("累積合意点");
    expect(user).toContain("累積対立点");
    expect(user).toContain("リモートワーク推進派");
    expect(user).toContain("ハイブリッド推奨");

    // Old rounds should NOT appear as full text
    expect(user).not.toContain("R1Claude");
    expect(user).not.toContain("R2GPT");

    // Recent rounds should be full text
    expect(user).toContain("R4Claude");
    expect(user).toContain("R5Gemini");
  });
});

describe("compressHistory with rolling summary", () => {
  it("prefers rolling summary over per-round summaries", () => {
    const history = Array.from({ length: 5 }, (_, i) =>
      makeRound([["claude", `R${i + 1}C`], ["chatgpt", `R${i + 1}G`], ["gemini", `R${i + 1}E`]])
    );
    const summaries = [
      makeSummary({ agreements: ["per-round A1"] }),
      makeSummary({ agreements: ["per-round A2"] }),
      makeSummary({ agreements: ["per-round A3"] }),
      null, null,
    ];
    const rolling = {
      agreements: [{ point: "rolling合意" }],
      disagreements: [],
      unresolved: [],
      stances: { claude: "stance_c", chatgpt: "stance_g", gemini: "stance_e" },
    };
    const result = compressHistory(history, summaries, null, rolling);

    // Should use rolling, not per-round
    expect(result).toContain("rolling合意");
    expect(result).not.toContain("per-round A1");
    expect(result).toContain("stance_c");
  });

  it("falls back to per-round summaries when rolling has error", () => {
    const history = Array.from({ length: 4 }, (_, i) =>
      makeRound([["claude", `R${i + 1}C`], ["chatgpt", `R${i + 1}G`], ["gemini", `R${i + 1}E`]])
    );
    const summaries = [
      makeSummary({ agreements: ["fallback合意"] }),
      makeSummary({ agreements: ["fallback合意2"] }),
      null, null,
    ];
    const rolling = { error: true };
    const result = compressHistory(history, summaries, null, rolling);

    expect(result).toContain("fallback合意");
    expect(result).not.toContain("error");
  });

  it("falls back to full text when neither rolling nor summaries exist", () => {
    const history = Array.from({ length: 4 }, (_, i) =>
      makeRound([["claude", `R${i + 1}C`], ["chatgpt", `R${i + 1}G`], ["gemini", `R${i + 1}E`]])
    );
    const result = compressHistory(history, null, null, null);

    expect(result).toContain("R1C");
    expect(result).toContain("R4E");
  });
});
