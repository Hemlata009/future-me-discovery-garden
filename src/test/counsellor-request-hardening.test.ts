import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recordGrowthEvent = vi.fn();
vi.mock("@/lib/growth.server", async (original) => ({
  ...(await original<typeof import("@/lib/growth.server")>()),
  recordGrowthEvent: (...args: unknown[]) => recordGrowthEvent(...args),
}));
const adminRpc = vi.fn();
const adminFrom = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => adminRpc(...args),
    from: (...args: unknown[]) => adminFrom(...args),
  },
}));

import { handleCounsellorRequest } from "@/lib/counsellor-request.server";
import { runGrowthReport } from "@/lib/growth-report.server";
import type { GrowthReport } from "@/lib/growth-metrics";
import { readCounsellorLimits } from "@/lib/rate-limit-config";

const PROJECT_ID = "6f1c2c1e-1b2a-4c3d-8e9f-0a1b2c3d4e5f";
const COOKIE = `fm_vid=${"b".repeat(43)}`;
const inserted: Record<string, unknown>[] = [];
const released: string[] = [];
const deliveryUpdates: Record<string, unknown>[] = [];
let insertFails = false;
let fetchMock: ReturnType<typeof vi.fn>;

function body(phone = "9876543210") {
  return {
    generated_project_id: PROJECT_ID,
    contact_name: "Test Parent",
    phone,
    who: "parent",
    language: "english",
    consent: true,
  };
}

function submit(phone?: string) {
  return handleCounsellorRequest(
    new Request("https://futureme.example/api/counsellor-request", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: COOKIE },
      body: JSON.stringify(body(phone)),
    }),
  );
}

function allowed(attemptId = "attempt-1") {
  return { data: { allowed: true, duplicate: false, attempt_id: attemptId }, error: null };
}

beforeEach(() => {
  process.env["VISITOR_HASH_SALT"] = "s".repeat(40);
  process.env["COUNSELLOR_WEBHOOK_URL"] = "https://counsellor.test/hook";
  inserted.length = 0;
  released.length = 0;
  deliveryUpdates.length = 0;
  insertFails = false;
  recordGrowthEvent.mockReset();
  adminRpc.mockReset();
  adminRpc.mockImplementation(async () => allowed());
  adminFrom.mockReset();
  adminFrom.mockImplementation((table: string) => {
    if (table === "generated_projects") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: PROJECT_ID,
                interest: "science",
                technology: "iot",
                class_status: "class12",
                generated_content: { title: "Plant sensor" },
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "visitor_attribution") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { referral_code: null, utm_source: null, utm_medium: null, utm_campaign: null },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "counsellor_requests") {
      return {
        insert: (payload: Record<string, unknown>) => {
          inserted.push(payload);
          return {
            select: () => ({
              single: async () =>
                insertFails
                  ? { data: null, error: { message: "insert failed" } }
                  : { data: { id: "request-new" }, error: null },
            }),
          };
        },
        update: (payload: Record<string, unknown>) => {
          deliveryUpdates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
      };
    }
    if (table === "counsellor_request_attempts") {
      return {
        delete: () => ({
          eq: async (_column: string, id: string) => {
            released.push(id);
            return { error: null };
          },
        }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
  fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env["VISITOR_HASH_SALT"];
  delete process.env["COUNSELLOR_WEBHOOK_URL"];
  delete process.env["VISITOR_COUNSELLOR_REQUESTS_LIMIT"];
  delete process.env["VISITOR_COUNSELLOR_REQUESTS_WINDOW_SECONDS"];
  delete process.env["GLOBAL_COUNSELLOR_REQUESTS_PER_DAY"];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("counsellor request hardening", () => {
  it("refuses the fourth request from one visitor in an hour", async () => {
    let claims = 0;
    adminRpc.mockImplementation(async () => {
      claims += 1;
      return claims === 4
        ? {
            data: { allowed: false, reason: "visitor", retry_after_seconds: 1800 },
            error: null,
          }
        : allowed(`attempt-${claims}`);
    });

    const statuses = [
      (await submit("9876543210")).status,
      (await submit("9876543211")).status,
      (await submit("9876543212")).status,
    ];
    const fourth = await submit("9876543213");

    expect(statuses).toEqual([200, 200, 200]);
    expect(fourth.status).toBe(429);
    expect(fourth.headers.get("retry-after")).toBe("1800");
    expect(inserted).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(adminRpc).toHaveBeenLastCalledWith(
      "claim_counsellor_request_slot",
      expect.objectContaining({ _visitor_limit: 3, _visitor_window_seconds: 3600 }),
    );
    expect(recordGrowthEvent.mock.calls[3]![0]).toMatchObject({
      failure_kind: "visitor_limit",
    });
  });

  it("refuses a request when the site-wide daily cap is reached", async () => {
    adminRpc.mockResolvedValue({
      data: { allowed: false, reason: "global", retry_after_seconds: 7200 },
      error: null,
    });

    const response = await submit();

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("7200");
    expect(adminRpc).toHaveBeenCalledWith(
      "claim_counsellor_request_slot",
      expect.objectContaining({ _global_per_day: 200 }),
    );
    expect(inserted).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordGrowthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ failure_kind: "global_limit" }),
    );
  });

  it("does not insert or deliver a duplicate phone for the same project within 24 hours", async () => {
    adminRpc.mockResolvedValueOnce(allowed()).mockResolvedValueOnce({
      data: { allowed: true, duplicate: true, request_id: "request-existing" },
      error: null,
    });

    expect((await submit()).status).toBe(200);
    const repeat = await submit();
    const result = (await repeat.json()) as { ok: boolean; duplicate: boolean; message: string };

    expect(repeat.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.duplicate).toBe(true);
    expect(result.message).toContain("already received");
    expect(inserted).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("releases the claimed slot when the request insert fails", async () => {
    insertFails = true;

    const response = await submit();

    expect(response.status).toBe(500);
    expect(released).toEqual(["attempt-1"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never puts a phone number in a recorded growth event", async () => {
    await submit("9876543210");
    adminRpc.mockResolvedValue({
      data: { allowed: false, reason: "visitor", retry_after_seconds: 60 },
      error: null,
    });
    await submit("9876543211");

    const events = JSON.stringify(recordGrowthEvent.mock.calls);
    expect(events).not.toContain("9876543210");
    expect(events).not.toContain("9876543211");
  });

  it("returns the live not-delivered count in the admin report", async () => {
    const report = { totals: { counsellor_undelivered: 4 } } as GrowthReport;
    adminRpc.mockResolvedValue({ data: report, error: null });
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) };

    const result = await runGrowthReport(
      { supabase, userId: "admin-user" },
      { from: "2026-11-01", to: "2026-11-17" },
    );

    expect(result.access).toBe("ok");
    if (result.access === "ok") expect(result.report.totals.counsellor_undelivered).toBe(4);
  });

  it("uses the documented defaults and accepts server-only overrides", () => {
    expect(readCounsellorLimits({})).toEqual({
      visitorLimit: 3,
      visitorWindowSeconds: 3600,
      globalPerDay: 200,
    });
    expect(
      readCounsellorLimits({
        VISITOR_COUNSELLOR_REQUESTS_LIMIT: "5",
        VISITOR_COUNSELLOR_REQUESTS_WINDOW_SECONDS: "7200",
        GLOBAL_COUNSELLOR_REQUESTS_PER_DAY: "100",
      }),
    ).toEqual({ visitorLimit: 5, visitorWindowSeconds: 7200, globalPerDay: 100 });
  });
});
