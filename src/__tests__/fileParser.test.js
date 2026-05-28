import { describe, it, expect } from "vitest";
import {
  extensionOf,
  isSupported,
  formatBytes,
  validateAttachment,
  buildAttachmentsBlock,
  estimateTokens,
  totalAttachmentBytes,
  shouldSummarize,
  MAX_FILES,
  HARD_LIMIT_BYTES,
  MAX_TOTAL_BYTES,
  SUMMARY_THRESHOLD_BYTES,
} from "../lib/fileParser";

// Stand-in for the File DOM object — validateAttachment only reads name/size.
const fakeFile = (name, size) => ({ name, size });

describe("extensionOf", () => {
  it("returns lowercase extension", () => {
    expect(extensionOf("report.PDF")).toBe("pdf");
    expect(extensionOf("notes.txt")).toBe("txt");
  });
  it("returns empty string when no extension", () => {
    expect(extensionOf("README")).toBe("");
    expect(extensionOf("")).toBe("");
  });
});

describe("isSupported", () => {
  it("accepts text and document formats", () => {
    expect(isSupported("a.txt")).toBe(true);
    expect(isSupported("a.md")).toBe(true);
    expect(isSupported("a.csv")).toBe(true);
    expect(isSupported("a.json")).toBe(true);
    expect(isSupported("a.pdf")).toBe(true);
    expect(isSupported("a.docx")).toBe(true);
  });
  it("rejects unsupported formats", () => {
    expect(isSupported("a.exe")).toBe(false);
    expect(isSupported("a.png")).toBe(false);
    expect(isSupported("a.zip")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats in B / KB / MB", () => {
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(2048)).toBe("2.0KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.00MB");
  });
});

describe("validateAttachment", () => {
  it("accepts a small text file", () => {
    const r = validateAttachment([], fakeFile("a.txt", 1024));
    expect(r.ok).toBe(true);
    expect(r.warn).toBeNull();
  });

  it("warns when above the soft limit", () => {
    const r = validateAttachment([], fakeFile("a.txt", 90 * 1024));
    expect(r.ok).toBe(true);
    expect(r.warn).toMatch(/トークン消費/);
  });

  it("rejects unsupported extensions", () => {
    const r = validateAttachment([], fakeFile("a.exe", 100));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/未対応/);
  });

  it("rejects a file exceeding HARD_LIMIT_BYTES", () => {
    const r = validateAttachment([], fakeFile("big.pdf", HARD_LIMIT_BYTES + 1));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/1ファイル/);
  });

  it("rejects when MAX_FILES already attached", () => {
    const list = Array.from({ length: MAX_FILES }, (_, i) => ({ id: `${i}`, name: `a${i}.txt`, size: 100, ext: "txt", text: "x" }));
    const r = validateAttachment(list, fakeFile("extra.txt", 100));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/最大/);
  });

  it("rejects when total bytes would exceed MAX_TOTAL_BYTES", () => {
    const list = [{ id: "1", name: "a.txt", size: MAX_TOTAL_BYTES - 1000, ext: "txt", text: "x" }];
    const r = validateAttachment(list, fakeFile("more.txt", 2000));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/合計/);
  });
});

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens(null)).toBe(0);
  });
  it("approximates length / 4 rounded up", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});

describe("buildAttachmentsBlock", () => {
  it("returns empty string when no attachments", () => {
    expect(buildAttachmentsBlock([])).toBe("");
    expect(buildAttachmentsBlock(null)).toBe("");
    expect(buildAttachmentsBlock(undefined)).toBe("");
  });

  it("renders each attachment with its filename header", () => {
    const block = buildAttachmentsBlock([
      { id: "1", name: "spec.md", size: 100, ext: "md", text: "本文1" },
      { id: "2", name: "data.csv", size: 200, ext: "csv", text: "本文2" },
    ]);
    expect(block).toContain("【添付ファイル】");
    expect(block).toContain("==== spec.md ====");
    expect(block).toContain("本文1");
    expect(block).toContain("==== data.csv ====");
    expect(block).toContain("本文2");
  });

  it("uses the summary instead of the full body when present", () => {
    const block = buildAttachmentsBlock([
      { id: "1", name: "long.pdf", size: 100000, ext: "pdf", text: "とても長い全文本文" + "x".repeat(100), summary: "短い要約版です" },
    ]);
    expect(block).toContain("==== long.pdf（要約版） ====");
    expect(block).toContain("短い要約版です");
    expect(block).not.toContain("とても長い全文本文");
  });

  it("falls back to text when summary is empty string", () => {
    const block = buildAttachmentsBlock([
      { id: "1", name: "a.txt", size: 10, ext: "txt", text: "原文", summary: "" },
    ]);
    expect(block).toContain("==== a.txt ====");
    expect(block).toContain("原文");
    expect(block).not.toContain("要約版");
  });
});

describe("totalAttachmentBytes", () => {
  it("sums size across attachments", () => {
    expect(totalAttachmentBytes([])).toBe(0);
    expect(totalAttachmentBytes(null)).toBe(0);
    expect(totalAttachmentBytes([{ size: 100 }, { size: 200 }, { size: 50 }])).toBe(350);
  });
});

describe("shouldSummarize", () => {
  const small = [{ size: 1024 }];
  const large = [{ size: SUMMARY_THRESHOLD_BYTES + 1 }];

  it("returns true for mode=on regardless of size", () => {
    expect(shouldSummarize("on", small)).toBe(true);
    expect(shouldSummarize("on", [])).toBe(true);
  });
  it("returns false for mode=off regardless of size", () => {
    expect(shouldSummarize("off", large)).toBe(false);
  });
  it("returns true for mode=auto only when above threshold", () => {
    expect(shouldSummarize("auto", small)).toBe(false);
    expect(shouldSummarize("auto", large)).toBe(true);
  });
});
