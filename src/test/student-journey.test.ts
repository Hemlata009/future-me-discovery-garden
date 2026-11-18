import { beforeEach, describe, expect, it } from "vitest";

import {
  addExploreSeconds,
  captureInvite,
  cleanPath,
  clearJourney,
  FIRST_PROMPT_SECONDS,
  markPrompted,
  MAX_LOG,
  NEXT_PROMPT_SECONDS,
  readJourney,
  recordPageView,
  shouldPrompt,
  storedInvite,
} from "@/lib/student-journey";
import { inviteLink, studentSignupSchema } from "@/lib/student-signup";

beforeEach(() => localStorage.clear());

describe("pre-sign-up journey in this browser", () => {
  it("stores only the path and capped seconds, never query strings", () => {
    recordPageView("/project?id=abc&ref=XYZ#demo", 12.4);
    recordPageView("/discover", 99999);
    recordPageView("/projects", 1); // too short to count
    expect(readJourney().map(({ path, seconds }) => ({ path, seconds }))).toEqual([
      { path: "/project", seconds: 12 },
      { path: "/discover", seconds: 3600 },
    ]);
    expect(cleanPath("?x=1")).toBe("/");
  });

  it("keeps at most the latest 150 pages and can be cleared after upload", () => {
    for (let i = 0; i < MAX_LOG + 20; i += 1) recordPageView(`/p${i}`, 5);
    expect(readJourney()).toHaveLength(MAX_LOG);
    expect(readJourney()[0]!.path).toBe("/p20");
    clearJourney();
    expect(readJourney()).toEqual([]);
  });
});

describe("free-account prompt timing", () => {
  it("waits 5 active minutes, asks again 10 minutes later, then stops", () => {
    addExploreSeconds(FIRST_PROMPT_SECONDS - 5);
    expect(shouldPrompt()).toBe(false);
    addExploreSeconds(5);
    expect(shouldPrompt()).toBe(true);
    markPrompted();
    expect(shouldPrompt()).toBe(false);
    addExploreSeconds(NEXT_PROMPT_SECONDS);
    expect(shouldPrompt()).toBe(true);
    markPrompted();
    addExploreSeconds(10 * NEXT_PROMPT_SECONDS);
    expect(shouldPrompt()).toBe(false);
  });
});

describe("invites", () => {
  it("remembers a valid invite and ignores malformed codes", () => {
    expect(captureInvite("?invite=RIYA12AB34&for=parent")).toEqual({
      code: "RIYA12AB34",
      kind: "parent",
    });
    expect(storedInvite()).toEqual({ code: "RIYA12AB34", kind: "parent" });
    expect(captureInvite("?invite=<script>")).toBeNull();
    expect(captureInvite("?invite=FRIENDCODE1")).toEqual({ code: "FRIENDCODE1", kind: "friend" });
  });

  it("builds invite links on the site's own origin", () => {
    expect(inviteLink("https://example.app", "RIYA12AB34", "parent")).toBe(
      "https://example.app/?invite=RIYA12AB34&for=parent",
    );
  });
});

describe("sign-up validation", () => {
  const valid = {
    full_name: "Asha Rao",
    email: "Asha@Example.com",
    password: "longenough",
    phone: "9876543210",
    class_status: "class12",
    city: "",
    language: "english",
    consent: true,
    journey: [{ path: "/discover", seconds: 30, at: "2026-11-18T10:00:00.000Z" }],
    prompts: 1,
    invite: null,
  };

  it("accepts basic details and lower-cases the email", () => {
    const parsed = studentSignupSchema.parse(valid);
    expect(parsed.email).toBe("asha@example.com");
  });

  it("requires consent, a valid mobile and an 8+ character password", () => {
    expect(studentSignupSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
    expect(studentSignupSchema.safeParse({ ...valid, phone: "12345" }).success).toBe(false);
    expect(studentSignupSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });

  it("rejects unexpected fields such as a role", () => {
    expect(studentSignupSchema.safeParse({ ...valid, role: "admin" }).success).toBe(false);
  });

  it("rejects journey paths that aren't plain site paths", () => {
    const bad = {
      ...valid,
      journey: [{ path: "https://evil.example", seconds: 3, at: valid.journey[0]!.at }],
    };
    expect(studentSignupSchema.safeParse(bad).success).toBe(false);
  });
});
