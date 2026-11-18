import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { engagementPayloadSchema, startEngagementHeartbeat } from "@/lib/engagement";
import { trackPayloadSchema } from "@/lib/tracking";

const projectId = "b6bd5c92-0b67-4ebb-ae27-592e9338fd9c";

function response(body: object = {}) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
}

describe("active engagement browser measurement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", `/project?id=${projectId}`);
    sessionStorage.clear();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes("/api/visitor")) return response();
        return response({ result: "ok" });
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends only a session ID and project ID, never a client duration", async () => {
    const stop = startEngagementHeartbeat();
    await vi.advanceTimersByTimeAsync(0);
    const call = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).includes("/api/engagement"));
    expect(call).toBeDefined();
    const body = JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
    expect(body).toEqual({ session_id: expect.any(String), generated_project_id: projectId });
    expect(body).not.toHaveProperty("active_seconds");
    stop();
  });

  it("reuses one session ID per browser tab session", async () => {
    const first = startEngagementHeartbeat();
    await vi.advanceTimersByTimeAsync(0);
    first();
    const second = startEngagementHeartbeat();
    await vi.advanceTimersByTimeAsync(0);
    second();
    const bodies = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes("/api/engagement"))
      .map((call) => JSON.parse(String(call[1]?.body)) as { session_id: string });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.session_id).toBe(bodies[1]?.session_id);
  });

  it("does not send while the tab is hidden", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    const stop = startEngagementHeartbeat();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/api/engagement")),
    ).toHaveLength(0);
    stop();
  });

  it("stops after extended inactivity", async () => {
    const stop = startEngagementHeartbeat();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(61_000);
    const before = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes("/api/engagement")).length;
    await vi.advanceTimersByTimeAsync(60_000);
    const after = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).includes("/api/engagement")).length;
    expect(after).toBe(before);
    stop();
  });
});

describe("engagement and demo payload validation", () => {
  it("rejects arbitrary active-time increments and extra fields", () => {
    expect(
      engagementPayloadSchema.safeParse({
        session_id: crypto.randomUUID(),
        generated_project_id: projectId,
        active_seconds: 99999,
      }).success,
    ).toBe(false);
  });

  it("allows demo interaction only for a generated project", () => {
    expect(
      trackPayloadSchema.safeParse({ event: "demo_interacted", project_id: projectId }).success,
    ).toBe(true);
    expect(trackPayloadSchema.safeParse({ event: "demo_interacted" }).success).toBe(false);
  });
});
