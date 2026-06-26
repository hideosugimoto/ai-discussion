import { describe, it, expect } from "vitest";
import { pts, trend, positionChanges } from "../lib/consensus";

describe("pts", () => {
  it("extracts .point from object items", () => {
    expect(pts([{ point: "A" }, { point: "B" }])).toEqual(["A", "B"]);
  });
  it("accepts plain strings", () => {
    expect(pts(["A", "B"])).toEqual(["A", "B"]);
  });
  it("drops null/empty and non-point objects", () => {
    expect(pts([{ point: "A" }, {}, null, "", "B"])).toEqual(["A", "B"]);
  });
  it("returns [] for non-arrays", () => {
    expect(pts(undefined)).toEqual([]);
    expect(pts(null)).toEqual([]);
    expect(pts({})).toEqual([]);
  });
});

describe("trend", () => {
  const round = (n) => ({ disagreements: Array.from({ length: n }, (_, i) => ({ point: `d${i}` })) });

  it("returns null with fewer than two summarized rounds", () => {
    expect(trend([])).toBeNull();
    expect(trend([round(2)])).toBeNull();
    expect(trend([round(1), null])).toBeNull(); // only one non-null
  });
  it("flags converging when conflicts decrease", () => {
    expect(trend([round(3), round(1)]).kind).toBe("converging");
  });
  it("flags diverging when conflicts increase", () => {
    expect(trend([round(1), round(3)]).kind).toBe("diverging");
  });
  it("flags flat when conflicts are unchanged", () => {
    expect(trend([round(2), round(2)]).kind).toBe("flat");
  });
  it("ignores null rounds between valid ones", () => {
    expect(trend([round(3), null, round(0)]).kind).toBe("converging");
  });
  it("treats missing disagreements as zero", () => {
    expect(trend([{}, round(2)]).kind).toBe("diverging");
  });
});

describe("positionChanges", () => {
  it("flattens across rounds with round numbers", () => {
    const summaries = [
      { positionChanges: [{ ai: "claude", description: "歩み寄り" }] },
      null,
      { positionChanges: [{ ai: "gemini", description: "再考" }] },
    ];
    expect(positionChanges(summaries)).toEqual([
      { round: 1, ai: "claude", description: "歩み寄り" },
      { round: 3, ai: "gemini", description: "再考" },
    ]);
  });
  it("supports the {model, change} shape", () => {
    expect(positionChanges([{ positionChanges: [{ model: "chatgpt", change: "変化" }] }]))
      .toEqual([{ round: 1, ai: "chatgpt", description: "変化" }]);
  });
  it("drops entries without a description", () => {
    expect(positionChanges([{ positionChanges: [{ ai: "claude" }] }])).toEqual([]);
  });
  it("returns [] for empty/missing input", () => {
    expect(positionChanges([])).toEqual([]);
    expect(positionChanges(null)).toEqual([]);
    expect(positionChanges([{}, null])).toEqual([]);
  });
});
