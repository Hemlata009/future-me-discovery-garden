import { describe, expect, it } from "vitest";

import {
  buildJourneyDetail,
  describeRate,
  isTestTraffic,
  ratio,
  referredJourney,
  type JourneyEvent,
  type ReferralLinkRow,
} from "@/lib/growth-journey";

const OWNER = "o".repeat(64);
const FRIEND = "f".repeat(64);
const PROJECT = "11111111-1111-4111-8111-111111111111";
const LINK: ReferralLinkRow = {
  code: "tSe2jGBD",
  owner_visitor_hash: OWNER,
  generated_project_id: PROJECT,
};

let clock = Date.parse("2026-11-15T10:00:00Z");
function ev(event_name: string, overrides: Partial<JourneyEvent> = {}): JourneyEvent {
  clock += 60_000;
  return {
    visitor_hash: FRIEND,
    event_name,
    generated_project_id: null,
    parent_brief_id: null,
    cta: null,
    referral_code: null,
    failure_kind: null,
    utm_source: null,
    created_at: new Date(clock).toISOString(),
    ...overrides,
  };
}

describe("referral journey regression (live mismatch 2026-11-18)", () => {
  it("counts a referred visitor whose first touch was direct (referral_code stored as null)", () => {
    // The visitor landed directly first, so first-touch attribution has no referral code,
    // and record_growth_event copied that null onto the referral_visit row.
    const events = [
      ev("landing_visit"),
      ev("referral_visit", { generated_project_id: PROJECT, referral_code: null }),
      ev("discovery_started"),
      ev("discovery_completed"),
    ];
    const journey = referredJourney(events, [LINK]);
    expect(journey).toMatchObject({
      referred_visitors: 1,
      started_discovery: 1,
      completed_discovery: 1,
      application_clicks: 0,
      matched_by_project: 1,
    });
  });

  it("prefers the exact link code once the database stores it", () => {
    const events = [
      ev("referral_visit", {
        generated_project_id: PROJECT,
        referral_code: null,
        referral_link_code: LINK.code,
      }),
    ];
    expect(referredJourney(events, [LINK])).toMatchObject({
      referred_visitors: 1,
      matched_by_project: 0,
    });
  });

  it("never counts the link owner as their own referral", () => {
    const events = [
      ev("referral_visit", {
        visitor_hash: OWNER,
        generated_project_id: PROJECT,
        referral_code: LINK.code,
      }),
    ];
    expect(referredJourney(events, [LINK]).referred_visitors).toBe(0);
  });

  it("only counts steps taken after the first referral visit", () => {
    const events = [
      ev("discovery_started"),
      ev("discovery_completed"),
      ev("referral_visit", { generated_project_id: PROJECT, referral_code: LINK.code }),
    ];
    expect(referredJourney(events, [LINK])).toMatchObject({
      referred_visitors: 1,
      started_discovery: 0,
      completed_discovery: 0,
    });
  });
});

describe("family engagement uses a brief cohort, not sequential event counts", () => {
  it("reports 2 generated / 1 shared / 2 opened without any 200% conversion", () => {
    const events = [
      ev("parent_brief_generated", { parent_brief_id: "b1" }),
      ev("parent_brief_generated", { parent_brief_id: "b2" }),
      ev("parent_brief_shared", { parent_brief_id: "b1" }),
      ev("parent_brief_opened", { parent_brief_id: "b1" }),
      ev("parent_brief_opened", { parent_brief_id: "b2" }),
      ev("parent_question_asked", { parent_brief_id: "b1" }),
    ];
    const { family } = buildJourneyDetail(events, []);
    expect(family).toMatchObject({
      cohort_briefs: 2,
      cohort_shared: 1,
      cohort_opened: 2,
      cohort_questioned: 1,
    });
    // Every cohort rate uses briefs generated as the denominator, so none can exceed 100%.
    for (const part of [family.cohort_shared, family.cohort_opened, family.cohort_questioned]) {
      expect(ratio(part, family.cohort_briefs).value).toBeLessThanOrEqual(1);
    }
  });

  it("keeps activity on older briefs out of the cohort but in the event counts", () => {
    const events = [
      ev("parent_brief_generated", { parent_brief_id: "new" }),
      ev("parent_brief_opened", { parent_brief_id: "old" }),
    ];
    const { family } = buildJourneyDetail(events, []);
    expect(family.cohort_opened).toBe(0);
    expect(family.briefs_opened_any).toBe(1);
  });
});

describe("overall funnel separates unique counts from event counts", () => {
  it("counts unique visitors, unique projects and raw events separately", () => {
    const other = "v".repeat(64);
    const events = [
      ev("discovery_started"),
      ev("discovery_started"), // same visitor, another day
      ev("discovery_started", { visitor_hash: other }),
      ev("discovery_completed"),
      ev("discovery_completed"),
      ev("generation_succeeded", { generated_project_id: "p1" }),
      ev("generation_succeeded", { generated_project_id: "p2" }),
      ev("project_shared", { generated_project_id: "p1" }),
      ev("project_shared", { generated_project_id: "p1" }),
      ev("cta_clicked", { cta: "start_application" }),
      ev("cta_clicked", { cta: "start_application" }),
      ev("cta_clicked", { cta: "visit_niat", visitor_hash: other }),
      ev("cta_clicked", { cta: "explore_niat" }),
    ];
    const detail = buildJourneyDetail(events, []);
    expect(detail.funnel).toEqual({
      starters: 2,
      completers: 1,
      generated_projects: 2,
      generation_events: 2,
      shared_projects: 1,
    });
    expect(detail.niat).toEqual({
      application_visitors: 1,
      application_events: 2,
      website_visitors: 1,
      website_events: 1,
      info_visitors: 1,
      info_events: 1,
    });
  });
});

describe("rates and test traffic", () => {
  it("states numerator, denominator and unit, and shows — for a zero denominator", () => {
    expect(describeRate(ratio(10, 80), "unique visitors")).toBe("12.5% (10 ÷ 80 unique visitors)");
    expect(describeRate(ratio(0, 0), "briefs generated")).toBe("— (0 ÷ 0 briefs generated)");
  });

  it("flags QA/test sources without touching attribution", () => {
    expect(isTestTraffic("qa")).toBe(true);
    expect(isTestTraffic("QA")).toBe(true);
    expect(isTestTraffic("email")).toBe(false);
    expect(isTestTraffic(null)).toBe(false);
    const events = [
      ev("landing_visit", { utm_source: "qa" }),
      ev("landing_visit", { utm_source: "qa" }),
    ];
    expect(buildJourneyDetail(events, []).test_traffic_visitors).toBe(1);
  });
});
