import { describe, expect, it } from "vitest";

import {
  campaignPerformance,
  crmKpis,
  csvCell,
  followUpBucket,
  fromLocalInput,
  journeyFunnel,
  leadPriority,
  leadSourceType,
  leadsToCsv,
  rangeForPreset,
  sortLeads,
  teamPerformance,
  toLocalInput,
  WARM_LEAD_CAMPAIGN,
} from "@/lib/counsellor-crm";
import type { LeadView } from "@/lib/counsellor-metrics";
import type { GrowthTotals } from "@/lib/growth-metrics";

const NOW = new Date("2026-11-18T10:00:00.000Z");

function lead(overrides: Partial<LeadView> = {}): LeadView {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    contact_name: "Test Parent",
    phone_masked: "••••••3210",
    visitor_hash: "a".repeat(64),
    generated_project_id: "22222222-2222-4222-8222-222222222222",
    parent_brief_id: null,
    language: "english",
    who: "student",
    interest: "farming",
    technology: "ai",
    class_status: "class12",
    project_title: "EcoBuddy",
    referral_code: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    status: "assigned",
    assigned_to: "33333333-3333-4333-8333-333333333333",
    next_follow_up_at: null,
    last_contacted_at: "2026-11-17T09:00:00.000Z",
    call_outcome: "reached",
    internal_notes: "secret note",
    delivered: true,
    created_at: "2026-11-15T09:00:00.000Z",
    updated_at: "2026-11-15T09:00:00.000Z",
    active_seconds: 0,
    meaningful_actions: 0,
    family_signals: [],
    referral_count: 0,
    last_activity: "2026-11-15T09:00:00.000Z",
    engagement_tier: "low",
    tier_reasons: [],
    application_clicks: 0,
    decision_steps: [],
    ...overrides,
  };
}

describe("follow-up buckets (UTC days)", () => {
  it("groups by overdue, today, tomorrow, upcoming and none", () => {
    expect(followUpBucket(lead({ next_follow_up_at: "2026-11-18T09:59:00Z" }), NOW)).toBe(
      "overdue",
    );
    expect(followUpBucket(lead({ next_follow_up_at: "2026-11-18T23:00:00Z" }), NOW)).toBe("today");
    expect(followUpBucket(lead({ next_follow_up_at: "2026-11-19T12:00:00Z" }), NOW)).toBe(
      "tomorrow",
    );
    expect(followUpBucket(lead({ next_follow_up_at: "2026-11-25T12:00:00Z" }), NOW)).toBe(
      "upcoming",
    );
    expect(followUpBucket(lead(), NOW)).toBe("none");
  });

  it("ignores closed and not-interested leads", () => {
    const past = "2026-11-01T00:00:00Z";
    expect(followUpBucket(lead({ status: "closed", next_follow_up_at: past }), NOW)).toBeNull();
    expect(
      followUpBucket(lead({ status: "not_interested", next_follow_up_at: past }), NOW),
    ).toBeNull();
  });
});

describe("lead priority (observable rules only)", () => {
  it("puts new unassigned requests first", () => {
    const result = leadPriority(
      lead({ status: "new", assigned_to: null, last_contacted_at: null }),
      NOW,
    );
    expect(result.level).toBe("now");
    expect(result.reasons).toContain("New request not yet assigned");
  });

  it("flags overdue follow-ups and uncontacted high engagement, parent questions and app clicks", () => {
    expect(leadPriority(lead({ next_follow_up_at: "2026-11-17T00:00:00Z" }), NOW).level).toBe(
      "now",
    );
    const uncontacted = { last_contacted_at: null };
    expect(leadPriority(lead({ ...uncontacted, engagement_tier: "high" }), NOW).reasons).toContain(
      "High engagement with no recorded contact",
    );
    expect(
      leadPriority(
        lead({
          ...uncontacted,
          family_signals: [
            { key: "parent_question_asked", label: "", at: "2026-11-16T00:00:00Z", note: "" },
          ],
        }),
        NOW,
      ).reasons,
    ).toContain("Parent question submitted with no recorded contact");
    expect(leadPriority(lead({ ...uncontacted, application_clicks: 1 }), NOW).level).toBe("now");
  });

  it("never hides a low-engagement lead that hasn't been contacted", () => {
    const result = leadPriority(lead({ last_contacted_at: null, engagement_tier: "low" }), NOW);
    expect(result.level).toBe("today");
    expect(result.reasons).toEqual(["Consented request not yet contacted"]);
  });

  it("uses scheduled dates for today/later, and no action for closed leads", () => {
    expect(leadPriority(lead({ next_follow_up_at: "2026-11-18T20:00:00Z" }), NOW).level).toBe(
      "today",
    );
    expect(leadPriority(lead({ next_follow_up_at: "2026-11-21T20:00:00Z" }), NOW).level).toBe(
      "later",
    );
    expect(leadPriority(lead({ status: "closed" }), NOW).level).toBe("none");
  });
});

describe("attribution", () => {
  it("classifies referral, campaign and direct without rewriting first touch", () => {
    expect(leadSourceType(lead({ referral_code: "abc", utm_source: "x" }))).toBe("referral");
    expect(leadSourceType(lead({ utm_campaign: WARM_LEAD_CAMPAIGN }))).toBe("campaign");
    expect(leadSourceType(lead())).toBe("direct");
  });

  it("joins lead outcomes to aggregate traffic and highlights the warm-lead test", () => {
    const rows = campaignPerformance(
      [
        lead({
          utm_source: "email",
          utm_medium: "crm",
          utm_campaign: WARM_LEAD_CAMPAIGN,
          application_clicks: 2,
          engagement_tier: "high",
        }),
        lead({ utm_source: "email", utm_medium: "crm", utm_campaign: WARM_LEAD_CAMPAIGN }),
        lead(),
      ],
      [
        {
          source: "email",
          medium: "crm",
          campaign: WARM_LEAD_CAMPAIGN,
          visitors: 40,
          generations: 12,
          shares: 0,
          niat_outbound: 0,
        },
      ],
    );
    expect(rows[0]).toMatchObject({
      campaign: WARM_LEAD_CAMPAIGN,
      highlighted: true,
      visitors: 40,
      generations: 12,
      leads: 2,
      high: 1,
      application_click_leads: 1,
      click_rate: 0.5,
    });
    expect(rows[1]).toMatchObject({ source: "(none)", leads: 1, visitors: 0 });
  });

  it("leaves traffic columns unavailable for counsellors without the growth report", () => {
    expect(campaignPerformance([lead()])[0]?.visitors).toBeNull();
  });
});

describe("funnel", () => {
  const totals = {
    visitors: 100,
    starts: 60,
    completions: 30,
    gen_ok: 24,
    briefs_generated: 10,
    briefs_opened: 6,
    parent_questions: 3,
    counsellor_requests: 2,
    application_clicks: 1,
  } as GrowthTotals;

  it("computes each step from the previous available stage and marks unavailable stages", () => {
    const stages = journeyFunnel(totals);
    expect(stages[1]).toMatchObject({ value: 60, from_previous: 0.6 });
    const demo = stages.find((stage) => stage.name === "Interactive demo used");
    expect(demo?.value).toBeNull();
    const brief = stages.find((stage) => stage.name === "Parent Brief generated");
    expect(brief?.from_previous).toBeCloseTo(10 / 24);
    expect(stages.at(-1)).toMatchObject({ name: "Completed NIAT application", value: null });
  });

  it("does not divide by zero", () => {
    const stages = journeyFunnel({ ...totals, visitors: 0 });
    expect(stages[1]?.from_previous).toBeNull();
  });
});

describe("team and KPIs", () => {
  it("summarises each assignee and the unassigned pool", () => {
    const rows = teamPerformance(
      [
        lead({ status: "qualified", next_follow_up_at: "2026-11-17T00:00:00Z" }),
        lead({ assigned_to: null, status: "new", last_contacted_at: null }),
      ],
      [{ user_id: "33333333-3333-4333-8333-333333333333", role: "counsellor" }],
      (id) => id ?? "Unassigned",
      NOW,
    );
    expect(rows[0]).toMatchObject({ assigned: 1, qualified: 1, overdue: 1, contacted: 1 });
    expect(rows.at(-1)).toMatchObject({ user_id: null, assigned: 1, new_leads: 1 });
  });

  it("counts operational KPIs with explicit denominators", () => {
    const kpis = crmKpis(
      [
        lead({ status: "new", assigned_to: null, last_contacted_at: null, active_seconds: 120 }),
        lead({ who: "parent", delivered: false, active_seconds: 0 }),
      ],
      NOW,
    );
    expect(kpis).toMatchObject({
      identified: 2,
      not_contacted: 1,
      unassigned: 1,
      undelivered: 1,
      parent_callbacks: 1,
      avg_active_seconds: 60,
    });
    expect(kpis.by_status.new).toBe(1);
    expect(crmKpis([], NOW).avg_active_seconds).toBeNull();
  });
});

describe("sorting, export and dates", () => {
  it("sorts by engagement and follow-up date", () => {
    const a = lead({ id: "a", engagement_tier: "high" });
    const b = lead({ id: "b", engagement_tier: "low", next_follow_up_at: "2026-11-19T00:00:00Z" });
    expect(sortLeads([b, a], "most_engaged").map((x) => x.id)).toEqual(["a", "b"]);
    expect(sortLeads([a, b], "follow_up").map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("exports masked phones only, without notes or visitor hashes, and defuses formulas", () => {
    const csv = leadsToCsv([lead({ contact_name: "=HYPERLINK(1)" })], () => "Counsellor A");
    expect(csv).toContain("••••••3210");
    expect(csv).not.toContain("secret note");
    expect(csv).not.toContain("a".repeat(64));
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("round-trips follow-up times through the local datetime input without shifting", () => {
    const iso = "2026-11-20T04:30:00.000Z";
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(fromLocalInput("")).toBeNull();
  });

  it("builds UTC reporting presets", () => {
    expect(rangeForPreset("today", NOW)).toEqual({ from: "2026-11-18", to: "2026-11-18" });
    expect(rangeForPreset("7", NOW)).toEqual({ from: "2026-11-12", to: "2026-11-18" });
    expect(rangeForPreset("month", NOW)).toEqual({ from: "2026-11-01", to: "2026-11-18" });
  });
});
