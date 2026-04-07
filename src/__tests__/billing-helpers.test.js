// Tests for pure helpers in functions/api/_lib_billing.js
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  usdToMicro,
  basePlanLimitMicro,
  endOfCurrentMonth,
} from "../../functions/api/_lib_billing.js";

describe("usdToMicro", () => {
  it("converts USD to integer microdollars", () => {
    expect(usdToMicro(1.96)).toBe(1_960_000);
    expect(usdToMicro(5.0)).toBe(5_000_000);
    expect(usdToMicro(0.01)).toBe(10_000);
    expect(usdToMicro(0)).toBe(0);
  });

  it("rounds to avoid floating point drift", () => {
    expect(Number.isInteger(usdToMicro(0.1 + 0.2))).toBe(true);
  });
});

describe("basePlanLimitMicro", () => {
  it("returns plus limit when plan is plus", () => {
    const env = { MONTHLY_COST_LIMIT_USD: "1.96", MONTHLY_COST_LIMIT_USD_PLUS: "5.00" };
    expect(basePlanLimitMicro(env, "plus")).toBe(5_000_000);
  });

  it("returns premium limit for premium plan", () => {
    const env = { MONTHLY_COST_LIMIT_USD: "1.96", MONTHLY_COST_LIMIT_USD_PLUS: "5.00" };
    expect(basePlanLimitMicro(env, "premium")).toBe(1_960_000);
  });

  it("falls back to premium limit for unknown plan strings", () => {
    const env = { MONTHLY_COST_LIMIT_USD: "1.96", MONTHLY_COST_LIMIT_USD_PLUS: "5.00" };
    expect(basePlanLimitMicro(env, "unknown")).toBe(1_960_000);
    expect(basePlanLimitMicro(env, undefined)).toBe(1_960_000);
  });

  it("uses default when env vars are missing", () => {
    expect(basePlanLimitMicro({}, "premium")).toBe(1_960_000);
    expect(basePlanLimitMicro({}, "plus")).toBe(5_000_000);
  });
});

describe("endOfCurrentMonth", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns last day of April for any day in April", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T10:00:00Z"));
    expect(endOfCurrentMonth()).toBe("2026-04-30");
  });

  it("returns last day of February (non-leap year)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-10T00:00:00Z"));
    expect(endOfCurrentMonth()).toBe("2027-02-28");
  });

  it("returns last day of February (leap year 2028)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2028-02-10T00:00:00Z"));
    expect(endOfCurrentMonth()).toBe("2028-02-29");
  });

  it("returns Dec 31 for December", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-15T00:00:00Z"));
    expect(endOfCurrentMonth()).toBe("2026-12-31");
  });

  it("works on the very last second of a month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T23:59:59Z"));
    expect(endOfCurrentMonth()).toBe("2026-04-30");
  });
});
