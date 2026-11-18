// DEMO DATA: illustrative sample only, not real user activity.
//
// A deterministic, browser-only fixture for the admin dashboard's Demo Preview.
// It is never sent to the server, never written to Supabase and never mixed with
// live report data. It contains no names, phone numbers, emails or visitor IDs.
import type { JourneyDetail } from "@/lib/growth-journey";
import type { GrowthReport } from "@/lib/growth-metrics";

export const DEMO_LABEL = "DEMO DATA — Illustrative sample only. Not real user activity.";
export const DEMO_DAYS = 30;

/** Splits an integer total across weights (largest remainder), so parts always sum exactly. */
export function spread(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * total);
  const parts = raw.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (let i = 0; left > 0; i = (i + 1) % order.length, left -= 1) parts[order[i]!.index]! += 1;
  return parts;
}

/** Gentle growth trend, weekly rhythm and a campaign bump; deterministic, never flat. */
function dayWeights(offset: number): number[] {
  return Array.from({ length: DEMO_DAYS }, (_, i) => {
    const trend = 0.75 + (i / (DEMO_DAYS - 1)) * 0.6;
    const weekly = 1 + 0.18 * Math.sin(((i + offset) / 7) * 2 * Math.PI);
    const bump = i >= 17 && i <= 21 ? 1.35 : 1;
    const texture = 1 + 0.07 * Math.sin(i * 2.3 + offset);
    return trend * weekly * bump * texture;
  });
}

function days(end: Date): string[] {
  const last = Date.parse(`${end.toISOString().slice(0, 10)}T00:00:00Z`);
  return Array.from({ length: DEMO_DAYS }, (_, i) =>
    new Date(last - (DEMO_DAYS - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
}

export const DEMO_TOTALS = {
  segmented: false,
  visitors: 2480,
  starts: 1214,
  completions: 861,
  gen_ok: 806,
  gen_fail: 19,
  gen_rejected: 9,
  shares: 334,
  shared_projects: 286,
  ref_visits: 214,
  ref_visitors: 198,
  ref_starts: 118,
  ref_gens: 59,
  qualified_referrals: 53,
  niat_modal_opens: 410,
  niat_outbound: 126,
  niat_outbound_visitors: 119,
  ref_niat_outbound: 17,
  views: 1540,
  briefs_generated: 308,
  briefs_shared: 198,
  briefs_opened: 152,
  parent_questions: 86,
  counsellor_requests: 64,
  counsellor_undelivered: 6,
  application_clicks: 48,
} satisfies GrowthReport["totals"];

const DEMO_CAMPAIGNS = [
  {
    source: "email",
    medium: "crm",
    campaign: "futureme_family_warmlead_test",
    visitors: 200,
    generations: 70,
    shares: 31,
    niat_outbound: 12,
    briefs: 34,
    counsellor_requests: 11,
    application_visitors: 9,
  },
  {
    source: "instagram",
    medium: "social",
    campaign: "class12_explorers",
    visitors: 420,
    generations: 118,
    shares: 52,
    niat_outbound: 19,
    briefs: 31,
    counsellor_requests: 7,
    application_visitors: 5,
  },
  {
    source: "google",
    medium: "cpc",
    campaign: "btech_ai_search",
    visitors: 360,
    generations: 104,
    shares: 40,
    niat_outbound: 15,
    briefs: 27,
    counsellor_requests: 6,
    application_visitors: 6,
  },
  {
    source: "youtube",
    medium: "video",
    campaign: "project_showcase",
    visitors: 200,
    generations: 65,
    shares: 24,
    niat_outbound: 11,
    briefs: 15,
    counsellor_requests: 3,
    application_visitors: 2,
  },
];

/** Builds the illustrative 30-day report ending on `end` (UTC). Pure and deterministic. */
export function buildDemoReport(end: Date = new Date()): GrowthReport {
  const dates = days(end);
  const visitors = spread(DEMO_TOTALS.visitors, dayWeights(0));
  const generations = spread(DEMO_TOTALS.gen_ok, dayWeights(1.3));
  const referrals = spread(DEMO_TOTALS.ref_visits, dayWeights(2.1));
  const starters = spread(1160, dayWeights(0.6));
  const completers = spread(842, dayWeights(0.9));

  const detail: JourneyDetail = {
    funnel: {
      starters: 1160,
      completers: 842,
      generated_projects: 806,
      generation_events: 806,
      shared_projects: 286,
    },
    niat: {
      application_visitors: 45,
      application_events: 48,
      website_visitors: 119,
      website_events: 126,
      info_visitors: 372,
      info_events: 410,
    },
    family: {
      cohort_briefs: 308,
      cohort_shared: 171,
      cohort_opened: 139,
      cohort_questioned: 74,
      share_events: 241,
      briefs_opened_any: 152,
      question_events: 86,
    },
    referral: {
      referred_visitors: 198,
      started_discovery: 112,
      completed_discovery: 81,
      application_clicks: 3,
      matched_by_project: 0,
    },
    test_traffic_visitors: 0,
    daily: dates.map((day, i) => ({
      day,
      starters: starters[i]!,
      completers: completers[i]!,
    })),
    application_visitors_by_source: [
      { name: "direct", visitors: 20 },
      { name: "campaign", visitors: 22 },
      { name: "referral", visitors: 3 },
    ],
    campaigns: DEMO_CAMPAIGNS.map((c) => ({
      source: c.source,
      medium: c.medium,
      campaign: c.campaign,
      briefs: c.briefs,
      counsellor_requests: c.counsellor_requests,
      application_visitors: c.application_visitors,
    })),
  };

  return {
    totals: { ...DEMO_TOTALS },
    start_cohort: { started: 1160, completed: 842 },
    referral_journey: {
      referred_visitors: 198,
      started_discovery: 112,
      completed_discovery: 81,
      application_clicks: 3,
    },
    journey_detail: detail,
    shares_by_channel: { copy: 141, whatsapp: 193 },
    failures_by_kind: { "anthropic:overloaded": 12, invalid_response: 7, visitor_limit: 9 },
    entry_pages: [
      { name: "home", value: 1490 },
      { name: "discover", value: 520 },
      { name: "project", value: 290 },
      { name: "showcase", value: 180 },
    ],
    daily: dates.map((day, i) => ({
      day,
      visitors: visitors[i]!,
      generations: generations[i]!,
      referral_visits: referrals[i]!,
    })),
    interests: [
      { name: "farming", value: 282 },
      { name: "robotics", value: 221 },
      { name: "gaming", value: 175 },
      { name: "science", value: 128 },
    ],
    technologies: [
      { name: "web", value: 384 },
      { name: "ai", value: 256 },
      { name: "iot", value: 166 },
    ],
    languages: [
      { name: "english", value: 634 },
      { name: "hindi", value: 108 },
      { name: "telugu", value: 64 },
    ],
    campaigns: DEMO_CAMPAIGNS.map(
      ({ source, medium, campaign, visitors, generations, shares, niat_outbound }) => ({
        source,
        medium,
        campaign,
        visitors,
        generations,
        shares,
        niat_outbound,
      }),
    ),
    acquisition: [
      { name: "direct", visitors: 1100, generations: 390, outbound_visitors: 48 },
      { name: "campaign", visitors: 1180, generations: 357, outbound_visitors: 54 },
      { name: "referral", visitors: 200, generations: 59, outbound_visitors: 17 },
    ],
    source_options: [],
    medium_options: [],
    campaign_options: [],
  };
}
