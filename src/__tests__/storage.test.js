import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadSettings, saveSettings, clearSettings } from "../storage";

// Mock localStorage
const store = {};
const localStorageMock = {
  getItem: vi.fn((key) => store[key] ?? null),
  setItem: vi.fn((key, val) => { store[key] = val; }),
  removeItem: vi.fn((key) => { delete store[key]; }),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.clearAllMocks();
});

describe("loadSettings", () => {
  it("returns empty object when nothing stored", () => {
    expect(loadSettings()).toEqual({});
  });

  it("returns parsed data", () => {
    store["ai-discussion-settings"] = JSON.stringify({ keys: { claude: "sk" } });
    expect(loadSettings()).toEqual({ keys: { claude: "sk" } });
  });

  it("returns empty object on invalid JSON", () => {
    store["ai-discussion-settings"] = "not-json";
    expect(loadSettings()).toEqual({});
  });
});

describe("saveSettings", () => {
  it("saves to localStorage", () => {
    saveSettings({ keys: { claude: "sk" }, profile: "test" });
    const saved = JSON.parse(store["ai-discussion-settings"]);
    expect(saved.keys.claude).toBe("sk");
    expect(saved.profile).toBe("test");
  });

  it("adds profileUpdatedAt when profile changes", () => {
    saveSettings({ profile: "first" });
    const saved1 = JSON.parse(store["ai-discussion-settings"]);
    expect(saved1.profileUpdatedAt).toBeDefined();

    const ts1 = saved1.profileUpdatedAt;
    saveSettings({ profile: "second" });
    const saved2 = JSON.parse(store["ai-discussion-settings"]);
    expect(saved2.profileUpdatedAt).toBeDefined();
    expect(saved2.profileUpdatedAt >= ts1).toBe(true);
  });

  it("preserves profileUpdatedAt when profile unchanged", () => {
    saveSettings({ profile: "same" });
    const ts1 = JSON.parse(store["ai-discussion-settings"]).profileUpdatedAt;

    saveSettings({ profile: "same" });
    const ts2 = JSON.parse(store["ai-discussion-settings"]).profileUpdatedAt;
    expect(ts2).toBe(ts1);
  });
});

describe("clearSettings", () => {
  it("removes the key", () => {
    store["ai-discussion-settings"] = "data";
    clearSettings();
    expect(store["ai-discussion-settings"]).toBeUndefined();
  });
});
