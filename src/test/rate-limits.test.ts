import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, limitMessage, readLimits } from "@/lib/rate-limit-config";
import { hashVisitorId, resolveVisitor } from "@/lib/visitor-session.server";

describe("generation limits", () => {
  it("defaults to 3 per visitor per 15 minutes", () => {
    expect(readLimits({}).visitorLimit).toBe(3);
    expect(readLimits({}).visitorWindowSeconds).toBe(900);
  });
  it("defaults the global caps to 60/minute and 500/day", () => {
    expect(readLimits({}).globalPerMinute).toBe(60);
    expect(readLimits({}).globalPerDay).toBe(500);
  });
  it("defaults output tokens to 4096", () => {
    expect(DEFAULT_LIMITS.maxOutputTokens).toBe(4096);
  });
  it("reads overrides from env", () => {
    const l = readLimits({ VISITOR_GENERATIONS_LIMIT: "5", GLOBAL_GENERATIONS_PER_DAY: "1000" });
    expect(l.visitorLimit).toBe(5);
    expect(l.globalPerDay).toBe(1000);
  });
  it("ignores invalid values", () => {
    expect(readLimits({ VISITOR_GENERATIONS_LIMIT: "-2" }).visitorLimit).toBe(3);
    expect(readLimits({ GLOBAL_GENERATIONS_PER_MINUTE: "abc" }).globalPerMinute).toBe(60);
  });
  it("tells a visitor how long to wait", () => {
    expect(limitMessage("visitor", 600)).toContain("10 minutes");
  });
});

describe("visitor session", () => {
  it("issues an HttpOnly SameSite=Lax cookie for new visitors", async () => {
    const r = await resolveVisitor(new Request("https://x.test/api"));
    expect(r.setCookie).toMatch(/HttpOnly/);
    expect(r.setCookie).toMatch(/SameSite=Lax/);
    expect(r.setCookie).toMatch(/Secure/);
  });
  it("reuses a valid cookie and stores only its hash", async () => {
    const id = "a".repeat(43);
    const r = await resolveVisitor(
      new Request("https://x.test/", { headers: { cookie: `fm_vid=${id}` } }),
    );
    expect(r.setCookie).toBeNull();
    expect(r.hash).toBe(await hashVisitorId(id));
    expect(r.hash).not.toContain(id);
  });
  it("replaces a malformed cookie", async () => {
    const r = await resolveVisitor(
      new Request("https://x.test/", { headers: { cookie: "fm_vid=hack" } }),
    );
    expect(r.setCookie).not.toBeNull();
  });
});
