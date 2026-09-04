// A failed plan read must never be reported as the "free" plan: that is what
// showed a paying user the plan picker during the D1 daily-read-limit outage
// (2026-09-04). These tests pin the distinction.
import { describe, it, expect } from "vitest";
import { planStateFrom, isPremiumPlan } from "../hooks/useAuth.js";
import { authErrorMessage } from "../authErrors.js";

describe("planStateFrom", () => {
  it("keeps a successfully read plan", () => {
    expect(planStateFrom({ plan: "premium" })).toEqual({ plan: "premium", planError: false });
    expect(planStateFrom({ plan: "free" })).toEqual({ plan: "free", planError: false });
  });

  it("reports a failed read as undetermined, NOT as free", () => {
    const state = planStateFrom({ error: true });
    expect(state.planError).toBe(true);
    expect(state.plan).toBeNull();
    expect(state.plan).not.toBe("free");
  });

  it("treats a missing/!plan response as a failed read", () => {
    expect(planStateFrom({})).toEqual({ plan: null, planError: true });
    expect(planStateFrom(undefined)).toEqual({ plan: null, planError: true });
    expect(planStateFrom(null)).toEqual({ plan: null, planError: true });
  });
});

describe("isPremiumPlan", () => {
  it("is true only for a known paid plan", () => {
    expect(isPremiumPlan("premium")).toBe(true);
    expect(isPremiumPlan("plus")).toBe(true);
  });

  it("is false for free", () => {
    expect(isPremiumPlan("free")).toBe(false);
  });

  it("is false when the plan is undetermined", () => {
    // Undetermined must not unlock premium UI — the server re-checks the plan
    // on every billable call, but the UI should not promise what it can't know.
    expect(isPremiumPlan(null)).toBe(false);
    expect(isPremiumPlan(undefined)).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("explains a transient server failure without blaming the user", () => {
    const msg = authErrorMessage("server_error");
    expect(msg).toContain("一時的なエラー");
    expect(msg).toContain("時間をおいて");
  });

  it("maps the known callback reasons", () => {
    expect(authErrorMessage("Invalid state (CSRF check failed)")).toContain("有効期限");
    expect(authErrorMessage("Token exchange failed")).toContain("認証に失敗");
    expect(authErrorMessage("Failed to get user info")).toContain("ユーザー情報");
    expect(authErrorMessage("Missing code or state")).toContain("ログイン情報");
    expect(authErrorMessage("Server configuration error")).toContain("サーバー設定");
  });

  it("unwraps the OAuth denial prefix", () => {
    expect(authErrorMessage("OAuth denied: access_denied")).toContain("キャンセル");
    expect(authErrorMessage("OAuth denied: something_else")).toContain("拒否");
  });

  it("never echoes an unrecognised server string into the UI", () => {
    const raw = "D1_ERROR: table users has no column named picture";
    const msg = authErrorMessage(raw);
    expect(msg).not.toContain("D1_ERROR");
    expect(msg).toBe(authErrorMessage("totally-unknown-code"));
  });

  it("falls back for empty or non-string input", () => {
    const fallback = authErrorMessage("unknown");
    expect(authErrorMessage("")).toBe(fallback);
    expect(authErrorMessage(null)).toBe(fallback);
    expect(authErrorMessage(undefined)).toBe(fallback);
    expect(authErrorMessage(42)).toBe(fallback);
  });
});
