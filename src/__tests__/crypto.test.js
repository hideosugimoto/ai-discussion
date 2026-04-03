import { describe, it, expect } from "vitest";
import { encryptSettings, decryptSettings } from "../crypto";

describe("crypto", () => {
  it("encrypt then decrypt round-trip returns original data", async () => {
    const original = JSON.stringify({ keys: { claude: "sk-test" }, profile: "test user" });
    const password = "test-password-123";

    const encrypted = await encryptSettings(original, password);
    expect(typeof encrypted).toBe("string");
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = await decryptSettings(encrypted, password);
    expect(decrypted).toBe(original);
  });

  it("decrypt with wrong password throws", async () => {
    const original = "secret data";
    const encrypted = await encryptSettings(original, "correct-pw");

    await expect(decryptSettings(encrypted, "wrong-pw")).rejects.toThrow();
  });

  it("decrypt with corrupted data throws", async () => {
    await expect(decryptSettings("not-valid-base64!!!", "pw")).rejects.toThrow();
  });

  it("handles empty string data", async () => {
    const encrypted = await encryptSettings("", "pw");
    const decrypted = await decryptSettings(encrypted, "pw");
    expect(decrypted).toBe("");
  });

  it("handles large data without stack overflow", async () => {
    const largeData = "x".repeat(100000);
    const encrypted = await encryptSettings(largeData, "pw");
    const decrypted = await decryptSettings(encrypted, "pw");
    expect(decrypted).toBe(largeData);
  });
});
