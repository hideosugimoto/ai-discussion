import { describe, it, expect } from "vitest";
import { SUGGESTED_QUESTIONS, QUESTION_CATEGORIES, PLACEHOLDER_ROTATION } from "../suggestedQuestions";
import { DISCUSSION_MODES } from "../constants";

describe("suggestedQuestions data integrity", () => {
  const validModes = new Set(DISCUSSION_MODES.map((m) => m.id));
  const validCats = new Set(QUESTION_CATEGORIES.map((c) => c.id));

  it("has exactly 50 questions", () => {
    expect(SUGGESTED_QUESTIONS).toHaveLength(50);
  });

  it("all question IDs are unique", () => {
    const ids = SUGGESTED_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all questions reference valid DISCUSSION_MODES", () => {
    SUGGESTED_QUESTIONS.forEach((q) => {
      expect(validModes.has(q.mode), `Question ${q.id} has invalid mode: ${q.mode}`).toBe(true);
    });
  });

  it("all questions reference valid QUESTION_CATEGORIES", () => {
    SUGGESTED_QUESTIONS.forEach((q) => {
      expect(validCats.has(q.category), `Question ${q.id} has invalid category: ${q.category}`).toBe(true);
    });
  });

  it("all questions have non-empty text", () => {
    SUGGESTED_QUESTIONS.forEach((q) => {
      expect(q.text.trim().length, `Question ${q.id} has empty text`).toBeGreaterThan(0);
    });
  });

  it("all questions have boolean needsProfile", () => {
    SUGGESTED_QUESTIONS.forEach((q) => {
      expect(typeof q.needsProfile, `Question ${q.id} needsProfile not boolean`).toBe("boolean");
    });
  });

  it("question text fits within topic max length (2000 chars)", () => {
    SUGGESTED_QUESTIONS.forEach((q) => {
      expect(q.text.length, `Question ${q.id} exceeds 2000 chars`).toBeLessThanOrEqual(2000);
    });
  });

  it("PLACEHOLDER_ROTATION is non-empty array of strings", () => {
    expect(Array.isArray(PLACEHOLDER_ROTATION)).toBe(true);
    expect(PLACEHOLDER_ROTATION.length).toBeGreaterThan(0);
    PLACEHOLDER_ROTATION.forEach((p) => {
      expect(typeof p).toBe("string");
      expect(p.trim().length).toBeGreaterThan(0);
    });
  });

  it("QUESTION_CATEGORIES IDs are unique", () => {
    const ids = QUESTION_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every category has at least one question", () => {
    QUESTION_CATEGORIES.forEach((c) => {
      const count = SUGGESTED_QUESTIONS.filter((q) => q.category === c.id).length;
      expect(count, `Category ${c.id} has no questions`).toBeGreaterThan(0);
    });
  });
});
