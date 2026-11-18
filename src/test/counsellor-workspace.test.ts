import { describe, expect, it, vi } from "vitest";

import {
  buildCounsellorReport,
  buildLeadView,
  engagementTier,
  maskPhone,
  type LeadEvent,
  type LeadSource,
} from "@/lib/counsellor-metrics";
import { updateLeadSchema } from "@/lib/counsellor-workspace.functions";
import { authorizeCounsellor } from "@/lib/counsellor-workspace.server";

const visitor = "a".repeat(64);
const project = "b6bd5c92-0b67-4ebb-ae27-592e9338fd9c";
const lead: LeadSource = {
  id: "25c3efb2-1653-4d2e-b73f-e73f909352b9",
  contact_name: "Test Student",
  phone: "+919876543210",
  visitor_hash: visitor,
  generated_project_id: project,
  parent_brief_id: "fc3e9275-d802-4a14-8793-ab98836ee471",
  language: "english",
  who: "student",
  interest: "gaming",
  technology: "web",
  class_status: "class12",
  project_title: "Game guide",
  referral_code: null,
  utm_source: "email",
  utm_medium: "warm_lead",
  utm_campaign: "futureme_family_warmlead_test",
  status: "new",
  assigned_to: null,
  next_follow_up_at: null,
  last_contacted_at: null,
  call_outcome: null,
  internal_notes: "",
  delivered: false,
  created_at: "2026-11-10T09:00:00.000Z",
  updated_at: "2026-11-10T09:00:00.000Z",
};

function event(id: string, name: string, at: string, extra: Partial<LeadEvent> = {}): LeadEvent {
  return {
    id,
    event_name: name,
    visitor_hash: visitor,
    generated_project_id: project,
    parent_brief_id: null,
    referral_code: null,
    channel: null,
    cta: null,
    failure_kind: null,
    created_at: at,
    ...extra,
  };
}

const events = [
  event("1", "project_viewed", "2026-11-10T09:10:00.000Z"),
  event("2", "demo_interacted", "2026-11-10T09:11:00.000Z"),
  event("3", "parent_brief_generated", "2026-11-10T09:12:00.000Z"),
  event("4", "parent_brief_shared", "2026-11-10T09:13:00.000Z", { channel: "copy" }),
  event("5", "parent_brief_opened", "2026-11-10T09:14:00.000Z", { visitor_hash: "b".repeat(64) }),
  event("6", "referral_visit", "2026-11-11T09:14:00.000Z", {
    visitor_hash: "c".repeat(64),
    referral_code: "ABCDEFGHJKLM",
  }),
];

describe("counsellor lead evidence and metrics", () => {
  it("masks contact details and keeps the raw phone out of the lead view", () => {
    const view = buildLeadView(lead, events, [], [], "2026-11-30");
    expect(view.phone_masked).toBe("+91 ••••••3210");
    expect(view).not.toHaveProperty("phone");
    expect(maskPhone("9876543210")).toBe("••••••3210");
  });

  it("counts stored meaningful actions, not referral visits as the owner's clicks", () => {
    const view = buildLeadView(
      lead,
      events,
      [],
      [{ code: "ABCDEFGHJKLM", owner_visitor_hash: visitor }],
      "2026-11-11",
    );
    expect(view.meaningful_actions).toBe(5);
    expect(view.referral_count).toBe(1);
    expect(view.engagement_tier).toBe("high");
    expect(view.decision_steps).toEqual(["Interactive demo used", "Parent Brief generated"]);
  });

  it("shows family evidence without treating sharing as delivery or an open as parent identity", () => {
    const view = buildLeadView(lead, events, [], [], "2026-11-30");
    expect(view.family_signals.map((signal) => signal.key)).toEqual([
      "parent_brief_generated",
      "parent_brief_shared",
      "parent_brief_opened",
    ]);
    expect(view.family_signals[1]?.note).toContain("delivery is not proven");
    expect(view.family_signals[2]?.note).toContain("not assumed to be a parent");
  });

  it("uses actual heartbeat and event UTC days in daily analytics", () => {
    const view = buildLeadView(
      lead,
      events,
      [{ visitor_hash: visitor, active_seconds: 30, created_at: "2026-11-11T10:00:00.000Z" }],
      [{ code: "ABCDEFGHJKLM", owner_visitor_hash: visitor }],
      "2026-11-30",
    );
    const report = buildCounsellorReport(
      [view],
      events,
      [{ visitor_hash: visitor, active_seconds: 30, created_at: "2026-11-11T10:00:00.000Z" }],
      { from: "2026-11-10", to: "2026-11-12" },
      new Date("2026-11-18T12:00:00Z"),
    );
    expect(report.daily).toEqual([
      { day: "2026-11-10", leads: 1, active_seconds: 0, meaningful_actions: 5 },
      { day: "2026-11-11", leads: 0, active_seconds: 30, meaningful_actions: 0 },
      { day: "2026-11-12", leads: 0, active_seconds: 0, meaningful_actions: 0 },
    ]);
    expect(report.kpis.identified_leads).toBe(1);
    expect(report.kpis.undelivered).toBe(1);
    expect(report.languages).toEqual([{ name: "english", value: 1 }]);
    expect(report.referral).toEqual({ visits: 1, leads_with_referrals: 1 });
  });

  it("applies the exact recent/action/decision-step tier rules", () => {
    expect(engagementTier(4, 2, "2026-11-29T00:00:00Z", "2026-11-30").tier).toBe("high");
    expect(engagementTier(2, 0, "2026-11-29T00:00:00Z", "2026-11-30").tier).toBe("medium");
    expect(engagementTier(20, 4, "2026-11-01T00:00:00Z", "2026-11-30").tier).toBe("low");
    expect(engagementTier(1, 0, "2026-11-29T00:00:00Z", "2026-11-30").tier).toBe("low");
  });
});

describe("counsellor access and update validation", () => {
  it("allows an explicitly assigned admin", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await expect(authorizeCounsellor({ supabase: { rpc }, userId: "admin-id" })).resolves.toBe(
      "admin",
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("allows an explicitly assigned counsellor and denies an ordinary user", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    await expect(authorizeCounsellor({ supabase: { rpc }, userId: "counsellor-id" })).resolves.toBe(
      "counsellor",
    );
    const denied = vi.fn().mockResolvedValue({ data: false, error: null });
    await expect(
      authorizeCounsellor({ supabase: { rpc: denied }, userId: "student-id" }),
    ).resolves.toBeNull();
  });

  it("rejects attempts to edit contact details or submit long notes", () => {
    expect(updateLeadSchema.safeParse({ id: lead.id, phone: "+919999999999" }).success).toBe(false);
    expect(
      updateLeadSchema.safeParse({ id: lead.id, internal_notes: "x".repeat(2001) }).success,
    ).toBe(false);
    expect(updateLeadSchema.safeParse({ id: lead.id, status: "follow_up" }).success).toBe(true);
  });
});

describe("team member emails for admins", () => {
  it("still returns the team when one email lookup fails", async () => {
    const { readAssignees } = await import("@/lib/counsellor-workspace.server");
    const rows = [
      { user_id: "a", role: "admin" },
      { user_id: "b", role: "counsellor" },
    ];
    const db = {
      from: () => ({
        select: () => ({ in: () => ({ range: async () => ({ data: rows, error: null }) }) }),
      }),
      auth: {
        admin: {
          getUserById: async (id: string) => {
            if (id === "b") throw new Error("network");
            return { data: { user: { email: "admin@example.com" } } };
          },
        },
      },
    };
    await expect(readAssignees(db as never)).resolves.toEqual([
      { user_id: "a", role: "admin", email: "admin@example.com" },
      { user_id: "b", role: "counsellor", email: null },
    ]);
  });
});

describe("lead referral visits (regression: visit stored without its link code)", () => {
  const PROJECT = "22222222-2222-4222-8222-222222222222";
  const owners = [
    { code: "OWNLINK00001", owner_visitor_hash: visitor, generated_project_id: PROJECT },
    { code: "OTHERLINK001", owner_visitor_hash: "d".repeat(64), generated_project_id: PROJECT },
  ];

  it("credits a referral visit with no stored code through the linked project", () => {
    const visit = event("r1", "referral_visit", "2026-11-11T10:00:00.000Z", {
      visitor_hash: "e".repeat(64),
      referral_code: null,
      generated_project_id: PROJECT,
    });
    expect(buildLeadView(lead, [visit], [], owners, "2026-11-11").referral_count).toBe(1);
  });

  it("does not credit a visit that came through someone else's known link", () => {
    const visit = event("r2", "referral_visit", "2026-11-11T10:00:00.000Z", {
      visitor_hash: "e".repeat(64),
      referral_code: "OTHERLINK001",
      generated_project_id: PROJECT,
    });
    expect(buildLeadView(lead, [visit], [], owners, "2026-11-11").referral_count).toBe(0);
  });
});
