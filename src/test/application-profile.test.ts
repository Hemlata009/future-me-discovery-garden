import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny fake of the service-role client: records what the handler asks for.
const calls: { op: string; args: unknown[] }[] = [];
let nextResult: { data: unknown; error: { code?: string; message?: string } | null } = {
  data: null,
  error: null,
};
function chain() {
  const builder: Record<string, unknown> = {};
  for (const op of ["select", "eq", "upsert", "delete"]) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  }
  builder["maybeSingle"] = async () => nextResult;
  builder["single"] = async () => nextResult;
  builder["then"] = (resolve: (value: unknown) => unknown) => resolve(nextResult);
  return builder;
}
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => (calls.push({ op: "from", args }), chain()) },
}));
const recordGrowthEvent = vi.fn();
vi.mock("@/lib/growth.server", async (original) => ({
  ...(await original<typeof import("@/lib/growth.server")>()),
  recordGrowthEvent: (...args: unknown[]) => recordGrowthEvent(...args),
}));

import {
  applicationProfileText,
  qualificationFromClassStatus,
  saveApplicationProfileSchema,
} from "@/lib/application-profile";
import { handleApplicationProfile } from "@/lib/application-profile.server";

const URL_BASE = "https://futureme.example/api/application-profile";
const COOKIE = `fm_vid=${"c".repeat(43)}`;
const fields = {
  student_name: "Asha Rao",
  student_phone: "9876543210",
  email: "",
  city: "Hyderabad",
  state: "Telangana",
  qualification: "class12_studying",
  passing_year: "2026",
  intended_course: "btech_partner_university",
};

function put(body: unknown, headers: Record<string, string> = {}) {
  return handleApplicationProfile(
    new Request(URL_BASE, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: COOKIE, ...headers },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  process.env["VISITOR_HASH_SALT"] = "s".repeat(40);
  calls.length = 0;
  recordGrowthEvent.mockReset();
  nextResult = { data: { ...fields, updated_at: "2026-11-18T10:00:00.000Z" }, error: null };
});

describe("pre-application profile rules", () => {
  it("requires consent and a valid Indian mobile number", () => {
    expect(saveApplicationProfileSchema.safeParse({ ...fields }).success).toBe(false);
    expect(
      saveApplicationProfileSchema.safeParse({ ...fields, student_phone: "12345", consent: true })
        .success,
    ).toBe(false);
    expect(saveApplicationProfileSchema.safeParse({ ...fields, consent: true }).success).toBe(true);
  });

  it("rejects fields that were never asked for, such as ID or payment data", () => {
    const withExtra = { ...fields, consent: true, aadhaar: "1234 5678 9012" };
    expect(saveApplicationProfileSchema.safeParse(withExtra).success).toBe(false);
  });

  it("labels the copy text as pre-application details, not an application", () => {
    const text = applicationProfileText(fields as never);
    expect(text).toContain("not a NIAT application");
    expect(text).toContain("Student mobile: 9876543210");
    expect(text).toContain("https://apply.niatindia.com/");
  });

  it("pre-fills qualification only from the student's own discovery answer", () => {
    expect(qualificationFromClassStatus("completed")).toBe("class12_completed");
    expect(qualificationFromClassStatus(undefined)).toBe("class12_studying");
  });
});

describe("/api/application-profile", () => {
  it("saves the visitor's own row with consent time and never logs analytics", async () => {
    const response = await put({ ...fields, consent: true });
    expect(response.status).toBe(200);
    const upsert = calls.find((call) => call.op === "upsert");
    const row = upsert?.args[0] as Record<string, unknown>;
    expect(row["visitor_hash"]).toMatch(/^[0-9a-f]{64}$/);
    expect(row["consent_at"]).toEqual(expect.any(String));
    expect(row["email"]).toBeNull();
    expect(row).not.toHaveProperty("consent");
    expect(upsert?.args[1]).toEqual({ onConflict: "visitor_hash" });
    expect(recordGrowthEvent).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses to save without consent", async () => {
    const response = await put({ ...fields });
    expect(response.status).toBe(400);
    expect(calls.some((call) => call.op === "upsert")).toBe(false);
  });

  it("blocks cross-site requests", async () => {
    const response = await put({ ...fields, consent: true }, { origin: "https://evil.example" });
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("returns nothing to a browser without a visitor cookie", async () => {
    const response = await handleApplicationProfile(new Request(URL_BASE));
    expect(await response.json()).toEqual({ ok: true, profile: null });
    expect(calls).toHaveLength(0);
  });

  it("reads and deletes only by the caller's hashed visitor id", async () => {
    await handleApplicationProfile(new Request(URL_BASE, { headers: { cookie: COOKIE } }));
    await handleApplicationProfile(
      new Request(URL_BASE, { method: "DELETE", headers: { cookie: COOKIE } }),
    );
    const filters = calls.filter((call) => call.op === "eq");
    expect(filters).toHaveLength(2);
    for (const filter of filters) expect(filter.args[0]).toBe("visitor_hash");
  });

  it("explains clearly when the database table has not been created yet", async () => {
    nextResult = { data: null, error: { code: "PGRST205" } };
    const response = await put({ ...fields, consent: true });
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("not-ready");
  });
});
