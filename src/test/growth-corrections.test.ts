import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recordGrowthEvent = vi.fn();
vi.mock("@/lib/growth.server", async (orig) => ({
  ...(await orig<typeof import("@/lib/growth.server")>()),
  recordGrowthEvent: (...a: unknown[]) => recordGrowthEvent(...a),
}));
const adminRpc = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: (...a: unknown[]) => adminRpc(...a) },
}));

import { buildTrackBody, entryPageFor, trackPayloadSchema } from "@/lib/tracking";
import { handleTrack, trackStatus } from "@/lib/track-handler.server";
import { limitOutcome, outcomeKindFor } from "@/lib/generate-project.server";
import { deriveMetrics, type GrowthTotals } from "@/lib/growth-metrics";
import { filtersSchema } from "@/lib/growth-report.functions";
import { runGrowthReport } from "@/lib/growth-report.server";

const COOKIE = `fm_vid=${"b".repeat(43)}`;
function trackRequest(body: unknown, cookie: string | null = COOKIE) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers["cookie"] = cookie;
  return new Request("https://futureme.example/api/track", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env["VISITOR_HASH_SALT"] = "s".repeat(40);
  recordGrowthEvent.mockReset();
  adminRpc.mockReset();
});
afterEach(() => {
  delete process.env["VISITOR_HASH_SALT"];
});

describe("entry-page visitor tracking", () => {
  it("1. a direct campaign landing on /discover is a counted entry with its UTM tags", () => {
    expect(entryPageFor("/discover")).toBe("discover");
    const body = buildTrackBody(
      { event: "landing_visit", entry_page: "discover" },
      "?utm_source=Instagram&utm_medium=social&utm_campaign=Launch",
    );
    expect(body).toMatchObject({
      event: "landing_visit",
      entry_page: "discover",
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "launch",
    });
    expect(trackPayloadSchema.safeParse(body).success).toBe(true);
  });
  it("counts a direct /parent entry and retains its referral code", () => {
    expect(entryPageFor("/parent")).toBe("parent");
    const body = buildTrackBody(
      { event: "landing_visit", entry_page: "parent" },
      "?id=2c9ff70e-6678-450d-8c46-26d8078ca361&ref=dvcFLjPfXGD2",
    );
    expect(body.ref).toBe("dvcFLjPfXGD2");
    expect(trackPayloadSchema.safeParse(body).success).toBe(true);
  });
  it("2. a direct referral landing on /project keeps the ref on the entry visit", () => {
    expect(entryPageFor("/project")).toBe("project");
    const body = buildTrackBody(
      { event: "landing_visit", entry_page: "project" },
      "?id=x&ref=dvcFLjPfXGD2",
    );
    expect(body.ref).toBe("dvcFLjPfXGD2");
    // other events never carry a URL ref
    expect(buildTrackBody({ event: "discovery_started" }, "?ref=dvcFLjPfXGD2").ref).toBeUndefined();
  });
  it("team pages are never counted as visitors", () => {
    expect(entryPageFor("/admin")).toBeNull();
    expect(entryPageFor("/auth")).toBeNull();
  });
  it("3. a duplicate landing event is reported as success, not a new record", async () => {
    recordGrowthEvent.mockResolvedValue("duplicate");
    const res = await handleTrack(trackRequest({ event: "landing_visit", entry_page: "home" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, result: "duplicate" });
  });
});

describe("event ingestion responses", () => {
  it("4. a database write failure returns 503 and ok:false", async () => {
    recordGrowthEvent.mockResolvedValue("error");
    const res = await handleTrack(trackRequest({ event: "landing_visit", entry_page: "home" }));
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
  });
  it("rate-limited ingestion returns 429", async () => {
    expect(trackStatus("rate_limited")).toBe(429);
    expect(trackStatus("ok")).toBe(200);
    expect(trackStatus("ignored")).toBe(200);
  });
  it("requests without a visitor cookie are refused and not recorded", async () => {
    const res = await handleTrack(
      trackRequest({ event: "landing_visit", entry_page: "home" }, null),
    );
    expect(res.status).toBe(401);
    expect(recordGrowthEvent).not.toHaveBeenCalled();
  });
});

const zero: GrowthTotals = {
  segmented: false,
  visitors: 0,
  starts: 0,
  completions: 0,
  gen_ok: 0,
  gen_fail: 0,
  gen_rejected: 0,
  shares: 0,
  shared_projects: 0,
  ref_visits: 0,
  ref_visitors: 0,
  ref_starts: 0,
  ref_gens: 0,
  qualified_referrals: 0,
  niat_modal_opens: 0,
  niat_outbound: 0,
  niat_outbound_visitors: 0,
  ref_niat_outbound: 0,
  views: 0,
  briefs_generated: 0,
  briefs_shared: 0,
  briefs_opened: 0,
  parent_questions: 0,
  counsellor_requests: 0,
  application_clicks: 0,
};

describe("dashboard metrics", () => {
  it("5. NIAT outbound rate uses outbound visitors only, never pop-up opens", () => {
    const m = deriveMetrics({
      ...zero,
      visitors: 10,
      niat_modal_opens: 8,
      niat_outbound_visitors: 2,
    });
    expect(m.niatOutboundRate).toBe(0.2);
  });
  it("6. a segmented cohort withholds completion rate; pre-AI rejections don't lower success", () => {
    const seg = deriveMetrics({
      ...zero,
      segmented: true,
      starts: null,
      completions: 5,
      gen_ok: 3,
      gen_fail: 1,
      gen_rejected: 4,
    });
    expect(seg.completionRate).toBeNull();
    expect(seg.generationSuccessRate).toBe(0.75);
  });
  it("7. source, medium and campaign are independent filters", () => {
    const f = filtersSchema.parse({
      from: "2026-11-01",
      to: "2026-11-15",
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "launch",
    });
    expect(f).toMatchObject({
      utm_source: "instagram",
      utm_medium: "social",
      utm_campaign: "launch",
    });
    expect(() =>
      filtersSchema.parse({ from: "2026-11-01", to: "2026-11-15", campaign: "x" }),
    ).toThrow();
  });
});

describe("generation outcomes", () => {
  it("8. every outcome has its own kind; limits are not Anthropic failures", () => {
    expect(outcomeKindFor("config")).toBe("config");
    expect(limitOutcome("visitor")).toBe("visitor_limit");
    expect(limitOutcome("global_day")).toBe("global_limit");
    expect(outcomeKindFor("no-object")).toBe("invalid_response");
    expect(outcomeKindFor("save")).toBe("save");
    expect(outcomeKindFor("network")).toBe("anthropic:network");
    expect(outcomeKindFor("rate-limit")).toBe("anthropic:rate-limit");
  });
});

describe("referral and admin rules", () => {
  it("9. a repeated referral visit is passed to the database deduper and reported as duplicate", async () => {
    recordGrowthEvent.mockResolvedValueOnce("ok").mockResolvedValueOnce("duplicate");
    const body = { event: "referral_visit", ref: "dvcFLjPfXGD2" };
    expect((await (await handleTrack(trackRequest(body))).json()).result).toBe("ok");
    expect((await (await handleTrack(trackRequest(body))).json()).result).toBe("duplicate");
    expect(recordGrowthEvent.mock.calls[0]![0].visitorHash).toBe(
      recordGrowthEvent.mock.calls[1]![0].visitorHash,
    );
  });
  it("10. a non-admin is denied and the report is never read", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) };
    const result = await runGrowthReport(
      { supabase, userId: "u1" },
      { from: "2026-11-01", to: "2026-11-15" },
    );
    expect(result).toEqual({ access: "denied" });
    expect(adminRpc).not.toHaveBeenCalled();
  });
  it("10b. an admin gets the report", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) };
    adminRpc.mockResolvedValue({ data: { totals: {} }, error: null });
    const result = await runGrowthReport(
      { supabase, userId: "u1" },
      { from: "2026-11-01", to: "2026-11-15", utm_source: "instagram" },
    );
    expect(result.access).toBe("ok");
    expect(adminRpc.mock.calls[0]![1]).toMatchObject({ _utm_source: "instagram" });
  });
});
