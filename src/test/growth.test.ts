import { describe, expect, it } from "vitest";
import {
  deriveMetrics,
  formatRate,
  isEmptyReport,
  presetRange,
  type GrowthTotals,
} from "@/lib/growth-metrics";
import { attributionFromSearch, referralUrl, trackPayloadSchema } from "@/lib/tracking";

const zero: GrowthTotals = {
  segmented: false,
  gen_rejected: 0,
  niat_modal_opens: 0,
  niat_outbound: 0,
  niat_outbound_visitors: 0,
  ref_niat_outbound: 0,
  visitors: 0,
  starts: 0,
  completions: 0,
  gen_ok: 0,
  gen_fail: 0,
  shares: 0,
  shared_projects: 0,
  ref_visits: 0,
  ref_visitors: 0,
  ref_starts: 0,
  ref_gens: 0,
  views: 0,
};

describe("dashboard formulas", () => {
  it("completion rate = completions / starts", () => {
    expect(deriveMetrics({ ...zero, starts: 10, completions: 4 }).completionRate).toBe(0.4);
  });
  it("generation success rate = succeeded / (succeeded + failed)", () => {
    expect(deriveMetrics({ ...zero, gen_ok: 3, gen_fail: 1 }).generationSuccessRate).toBe(0.75);
  });
  it("share rate = distinct shared projects / successful generations", () => {
    expect(deriveMetrics({ ...zero, gen_ok: 8, shared_projects: 2, shares: 5 }).shareRate).toBe(
      0.25,
    );
  });
  it("shows a dash instead of a number when nothing to divide by", () => {
    expect(formatRate(deriveMetrics(zero).completionRate)).toBe("—");
  });
  it("treats zero visitors as an empty report", () => {
    expect(isEmptyReport(zero)).toBe(true);
  });
  it("7-day preset covers today and the six days before", () => {
    expect(presetRange(7, new Date("2026-11-15T10:00:00Z"))).toEqual({
      from: "2026-11-09",
      to: "2026-11-15",
    });
  });
});

describe("tracking input", () => {
  it("rejects events the browser may not send", () => {
    expect(trackPayloadSchema.safeParse({ event: "generation_succeeded" }).success).toBe(false);
  });
  it("rejects extra fields", () => {
    expect(trackPayloadSchema.safeParse({ event: "landing_visit", admin: true }).success).toBe(
      false,
    );
  });
  it("requires a channel for shares", () => {
    const id = "6f1c2c1e-1b2a-4c3d-8e9f-0a1b2c3d4e5f";
    expect(trackPayloadSchema.safeParse({ event: "project_shared", project_id: id }).success).toBe(
      false,
    );
    expect(
      trackPayloadSchema.safeParse({ event: "project_shared", project_id: id, channel: "whatsapp" })
        .success,
    ).toBe(true);
  });
  it("keeps valid UTM tags and drops malformed referral codes", () => {
    expect(attributionFromSearch("?utm_source=Instagram&ref=friend")).toEqual({
      utm_source: "instagram",
    });
  });
  it("puts the referral code in the share link", () => {
    expect(referralUrl("https://x.test", "abc", "ABCDEFGHJKLM")).toBe(
      "https://x.test/project?id=abc&ref=ABCDEFGHJKLM",
    );
  });
});
