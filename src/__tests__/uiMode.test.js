import { describe, it, expect } from "vitest";
import { UI_MODES } from "../constants";

describe("UI_MODES constant", () => {
  it("has exactly three modes", () => {
    expect(UI_MODES).toHaveLength(3);
  });

  it("each mode has required properties", () => {
    UI_MODES.forEach((mode) => {
      expect(mode).toHaveProperty("id");
      expect(mode).toHaveProperty("label");
      expect(mode).toHaveProperty("icon");
      expect(mode).toHaveProperty("description");
      expect(typeof mode.id).toBe("string");
      expect(typeof mode.label).toBe("string");
      expect(typeof mode.icon).toBe("string");
      expect(typeof mode.description).toBe("string");
    });
  });

  it("mode ids are unique", () => {
    const ids = UI_MODES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mode ids match expected values in order", () => {
    expect(UI_MODES.map((m) => m.id)).toEqual(["structure", "action", "experience"]);
  });

  it("default mode is structure", () => {
    expect(UI_MODES[0].id).toBe("structure");
  });
});
