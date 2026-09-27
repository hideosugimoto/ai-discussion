// 自前キー経路（src/api.js の直接呼び出し）でネイティブ検索が正しく組み立てられるか。
//
// 検証しているのはリクエストの形だけで、各社APIが実際に受理するかは別（実キーが
// 必要）。それでも「プラン経由では検索できるのに自前キーでは黙って検索なしで走る」
// という今回のバグは、ここで組み立てを固定しておけば再発を検知できる。
import { describe, it, expect, vi, afterEach } from "vitest";
import { callClaude, callChatGPT, callGemini, buildClaudeSearchTools } from "../api.js";
import { RESEARCH_CONFIG } from "../constants.js";

// SSE 本文を1チャンクで返す fetch レスポンスのスタブ。
function sseResponse(lines) {
  const payload = new TextEncoder().encode(lines.map((l) => `data: ${l}\n`).join(""));
  let sent = false;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: payload })),
        cancel: () => {},
      }),
    },
  };
}

function mockFetch(lines) {
  const fn = vi.fn(async () => sseResponse(lines));
  global.fetch = fn;
  return fn;
}

const bodyOf = (fn) => JSON.parse(fn.mock.calls[0][1].body);
const urlOf = (fn) => fn.mock.calls[0][0];

afterEach(() => { vi.restoreAllMocks(); delete global.fetch; });

describe("callClaude native search", () => {
  const CHUNK = JSON.stringify({ delta: { text: "本文" } });

  it("ツールを付けない（nativeSearch なし）", async () => {
    const fn = mockFetch([CHUNK]);
    const text = await callClaude("k", "claude-sonnet-4-6", "sys", "user", () => {});
    expect(text).toBe("本文");
    expect(bodyOf(fn).tools).toBeUndefined();
  });

  it("web_search を付ける（max_uses は既定1）", async () => {
    const fn = mockFetch([CHUNK]);
    await callClaude("k", "claude-sonnet-4-6", "sys", "user", () => {}, undefined, undefined, true);
    const tools = bodyOf(fn).tools;
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ type: "web_search_20250305", name: "web_search", max_uses: 1 });
  });

  it("調査モードの opts で web_fetch も付き、取り込み上限が入る", async () => {
    const fn = mockFetch([CHUNK]);
    await callClaude("k", "claude-sonnet-4-6", "sys", "user", () => {}, undefined, undefined, true, {
      searchMaxUses: RESEARCH_CONFIG.searchBudget, nativeFetch: true, maxTokens: RESEARCH_CONFIG.roundMaxTokens,
    });
    const body = bodyOf(fn);
    expect(body.max_tokens).toBe(RESEARCH_CONFIG.roundMaxTokens);
    expect(body.tools.map((t) => t.type)).toEqual(["web_search_20250305", "web_fetch_20250910"]);
    expect(body.tools[0].max_uses).toBe(RESEARCH_CONFIG.searchBudget);
    expect(body.tools[1]).toMatchObject({
      max_uses: RESEARCH_CONFIG.searchBudget,
      max_content_tokens: RESEARCH_CONFIG.fetchContentTokens,
    });
  });
});

describe("callChatGPT native search", () => {
  it("検索なしなら Chat Completions のまま", async () => {
    const fn = mockFetch([JSON.stringify({ choices: [{ delta: { content: "あ" } }] })]);
    const text = await callChatGPT("k", "gpt-5.4-mini", "sys", "user", () => {});
    expect(text).toBe("あ");
    expect(urlOf(fn)).toBe("https://api.openai.com/v1/chat/completions");
    expect(bodyOf(fn).tools).toBeUndefined();
  });

  it("検索ありなら Responses API に切り替わり web_search が付く", async () => {
    const fn = mockFetch([JSON.stringify({ type: "response.output_text.delta", delta: "い" })]);
    const text = await callChatGPT("k", "gpt-5.4-mini", "sys", "user", () => {}, undefined, true, { maxTokens: 3000 });
    expect(text).toBe("い");
    expect(urlOf(fn)).toBe("https://api.openai.com/v1/responses");
    const body = bodyOf(fn);
    expect(body.tools).toEqual([{ type: "web_search" }]);
    expect(body.instructions).toBe("sys");
    expect(body.input).toBe("user");
    // Chat 側の messages 形式は混ぜない
    expect(body.messages).toBeUndefined();
  });
});

describe("callGemini native search", () => {
  const CHUNK = JSON.stringify({ candidates: [{ content: { parts: [{ text: "う" }] } }] });

  it("検索なしならツールなし", async () => {
    const fn = mockFetch([CHUNK]);
    const text = await callGemini("k", "gemini-3.1-flash-lite", "sys", "user", () => {});
    expect(text).toBe("う");
    expect(bodyOf(fn).tools).toBeUndefined();
  });

  it("検索ありなら google_search グラウンディングが付く", async () => {
    const fn = mockFetch([CHUNK]);
    await callGemini("k", "gemini-3.1-flash-lite", "sys", "user", () => {}, undefined, true);
    expect(bodyOf(fn).tools).toEqual([{ google_search: {} }]);
  });
});

// 切り出したツール組み立て単体。プロキシ側 callAnthropic() と同じ形を保つための
// 固定テスト（ここがずれると「プラン経由では検索するのに自前キーでは検索しない」に戻る）。
describe("buildClaudeSearchTools", () => {
  it("検索なしなら undefined", () => {
    expect(buildClaudeSearchTools(false, { nativeFetch: true })).toBeUndefined();
    expect(buildClaudeSearchTools(undefined, undefined)).toBeUndefined();
  });

  it("nativeFetch なしでは web_search だけ", () => {
    const tools = buildClaudeSearchTools(true, undefined);
    expect(tools.map((t) => t.name)).toEqual(["web_search"]);
  });

  it("max_uses は search と fetch で揃う", () => {
    const tools = buildClaudeSearchTools(true, { searchMaxUses: 5, nativeFetch: true });
    expect(tools.map((t) => t.max_uses)).toEqual([5, 5]);
  });
});
