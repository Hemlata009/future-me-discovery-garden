import { describe, expect, it } from "vitest";

import {
  behaviourScore,
  scoreBand,
  summariseActivity,
  type ActivityRow,
} from "@/lib/behaviour-score";

const NOW = new Date("2026-11-18T12:00:00Z");
const row = (kind: ActivityRow["kind"], extra: Partial<ActivityRow> = {}): ActivityRow => ({
  kind,
  path: null,
  seconds: null,
  detail: null,
  created_at: "2026-11-17T10:00:00Z",
  ...extra,
});

describe("activity summary", () => {
  it("counts pages, time, logins, return visits and invites", () => {
    const summary = summariseActivity([
      row("page_view", { path: "/discover", seconds: 120 }),
      row("page_view", { path: "/discover", seconds: 60 }),
      row("page_view", { path: "/projects", seconds: 99999 }),
      row("login", { created_at: "2026-11-16T10:00:00Z" }),
      row("login", { created_at: "2026-11-17T09:00:00Z" }),
      row("logout"),
      row("return_visit"),
      row("signup", { created_at: "2026-11-15T10:00:00Z" }),
      row("invite_created", { detail: "parent" }),
      row("invite_visit", { detail: "parent" }),
      row("invite_visit", { detail: "friend" }),
      row("invite_signup", { detail: "friend" }),
    ]);
    expect(summary).toMatchObject({
      page_views: 3,
      pages_explored: 2,
      page_seconds: 120 + 60 + 3600,
      logins: 2,
      logouts: 1,
      return_visits: 1,
      last_login: "2026-11-17T09:00:00Z",
      signed_up_at: "2026-11-15T10:00:00Z",
      parent_invites: 1,
      parent_visits: 1,
      friend_visits: 1,
      invite_signups: 1,
    });
    expect(summary.top_pages[0]).toEqual({ path: "/projects", views: 1, seconds: 3600 });
  });
});

describe("behaviour score", () => {
  const base = {
    active_seconds: 0,
    behaviour: summariseActivity([]),
    has_project: false,
    used_demo: false,
    brief_generated: false,
    brief_shared: false,
    parent_question: false,
    application_clicked: false,
    last_activity: "2026-10-01T00:00:00Z",
  };

  it("is 0 with no activity and every part shows its maximum", () => {
    const result = behaviourScore(base, NOW);
    expect(result.score).toBe(0);
    expect(result.band).toBe("getting_started");
    expect(result.parts.reduce((sum, part) => sum + part.max, 0)).toBe(100);
  });

  it("rewards a fully engaged student up to 100 and never above", () => {
    const behaviour = summariseActivity([
      ...Array.from({ length: 8 }, (_, i) => row("page_view", { path: `/p${i}`, seconds: 600 })),
      ...Array.from({ length: 6 }, () => row("login")),
      row("invite_created", { detail: "parent" }),
      row("invite_visit", { detail: "parent" }),
      row("invite_created", { detail: "friend" }),
      ...Array.from({ length: 5 }, () => row("invite_visit", { detail: "friend" })),
      row("invite_signup", { detail: "friend" }),
    ]);
    const result = behaviourScore(
      {
        active_seconds: 3600,
        behaviour,
        has_project: true,
        used_demo: true,
        brief_generated: true,
        brief_shared: true,
        parent_question: true,
        application_clicked: true,
        last_activity: "2026-11-18T10:00:00Z",
      },
      NOW,
    );
    expect(result.score).toBe(100);
    expect(result.band).toBe("very_active");
    for (const part of result.parts) expect(part.points).toBeLessThanOrEqual(part.max);
  });

  it("explains each part in plain words", () => {
    const result = behaviourScore({ ...base, active_seconds: 600, has_project: true }, NOW);
    const time = result.parts.find((part) => part.key === "time")!;
    expect(time).toMatchObject({ points: 10, detail: "10 active minutes" });
    expect(result.parts.find((part) => part.key === "project")!.detail).toBe("AI project");
  });

  it("uses fixed band thresholds", () => {
    expect(scoreBand(70)).toBe("very_active");
    expect(scoreBand(69)).toBe("active");
    expect(scoreBand(40)).toBe("active");
    expect(scoreBand(39)).toBe("getting_started");
  });
});
