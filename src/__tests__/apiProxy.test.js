// Tests for pure helpers in src/apiProxy.js
import { describe, it, expect } from "vitest";
import { extractChatGPTChunk } from "../apiProxy.js";

describe("extractChatGPTChunk", () => {
  it("reads text from a Chat Completions delta (shared / no-search)", () => {
    const json = { choices: [{ delta: { content: "こんにちは" } }] };
    expect(extractChatGPTChunk(json)).toBe("こんにちは");
  });

  it("reads text from a Responses API delta (native search)", () => {
    const json = { type: "response.output_text.delta", delta: "検索結果より" };
    expect(extractChatGPTChunk(json)).toBe("検索結果より");
  });

  it("returns '' for a Responses delta event with no text", () => {
    expect(extractChatGPTChunk({ type: "response.output_text.delta" })).toBe("");
  });

  it("returns '' for non-text frames (usage, tool markers, completed)", () => {
    expect(extractChatGPTChunk({ type: "response.completed", response: { usage: {} } })).toBe("");
    expect(extractChatGPTChunk({ usage: { prompt_tokens: 10 } })).toBe("");
    expect(extractChatGPTChunk({ choices: [{ finish_reason: "stop" }] })).toBe("");
  });

  it("tolerates null / empty input", () => {
    expect(extractChatGPTChunk(null)).toBe("");
    expect(extractChatGPTChunk({})).toBe("");
    expect(extractChatGPTChunk(undefined)).toBe("");
  });
});
