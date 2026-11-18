import type { JourneyDetail } from "@/lib/growth-journey";

// Browser-safe: turns the database's raw counts into dashboard metrics.
// Every rate is null (shown as "—") when its denominator is zero, never a guess.

export type GrowthTotals = {
  /** True when an answer filter is active: numbers cover one visitor cohort. */
  segmented: boolean;
  visitors: number;
  /** Null inside a segment: starts carry no answers, so they can't be attributed to one. */
  starts: number | null;
  completions: number;
  gen_ok: number;
  /** Failures after the request reached the AI stage (Anthropic, invalid reply, save). */
  gen_fail: number;
  /** Rejected before any AI call (config, visitor or site-wide limits). */
  gen_rejected: number;
  /** Share actions: link copied or WhatsApp opened, not proof a link was received. */
  shares: number;
  shared_projects: number;
  ref_visits: number;
  ref_visitors: number;
  ref_starts: number;
  ref_gens: number;
  /** First-touch referred visitors who completed a discovery; link clicks alone never qualify. */
  qualified_referrals: number;
  niat_modal_opens: number;
  niat_outbound: number;
  niat_outbound_visitors: number;
  ref_niat_outbound: number;
  views: number;
  briefs_generated: number;
  briefs_shared: number;
  briefs_opened: number;
  parent_questions: number;
  counsellor_requests: number;
  counsellor_undelivered: number;
  application_clicks: number;
};

/**
 * Start cohort: distinct visitors whose first recorded discovery start falls in
 * the selected period, and how many of them have a completion at or after that
 * start, up to the end of the period. Absent when the cohort couldn't be read.
 */
export type StartCohort = { started: number; completed: number };

type StartRow = { visitor_hash: string; created_at: string };

/** Pure cohort matching: completions without an earlier start in the period never count. */
export function matchStartCohort(starts: StartRow[], completions: StartRow[]): StartCohort {
  const firstStart = new Map<string, number>();
  for (const s of starts) {
    const t = Date.parse(s.created_at);
    const prev = firstStart.get(s.visitor_hash);
    if (prev === undefined || t < prev) firstStart.set(s.visitor_hash, t);
  }
  const done = new Set<string>();
  for (const c of completions) {
    const start = firstStart.get(c.visitor_hash);
    if (start !== undefined && Date.parse(c.created_at) >= start) done.add(c.visitor_hash);
  }
  return { started: firstStart.size, completed: done.size };
}

export type Named = { name: string | null; value: number };
export type ReferralJourney = {
  referred_visitors: number;
  started_discovery: number;
  completed_discovery: number;
  application_clicks: number;
};

/** Referred-visitor journey steps; each rate uses the referred-visitor count, "—" when zero. */
export function referralJourneySteps(j: ReferralJourney) {
  return [
    { label: "Referred visitors", value: j.referred_visitors, rate: null as number | null },
    {
      label: "Started discovery",
      value: j.started_discovery,
      rate: rate(j.started_discovery, j.referred_visitors),
    },
    {
      label: "Completed discovery",
      value: j.completed_discovery,
      rate: rate(j.completed_discovery, j.referred_visitors),
    },
    {
      label: "Continued to application",
      value: j.application_clicks,
      rate: rate(j.application_clicks, j.referred_visitors),
    },
  ];
}

export type GrowthReport = {
  referral_journey?: ReferralJourney;
  /** Unique-vs-event journey figures; absent for answer-filtered cohorts or on read failure. */
  journey_detail?: JourneyDetail;
  start_cohort?: StartCohort;
  totals: GrowthTotals;
  shares_by_channel: Record<string, number>;
  failures_by_kind: Record<string, number>;
  entry_pages: Named[];
  daily: { day: string; visitors: number; generations: number; referral_visits: number }[];
  interests: Named[];
  technologies: Named[];
  languages: Named[];
  campaigns: {
    source: string;
    medium: string;
    campaign: string;
    visitors: number;
    generations: number;
    shares: number;
    niat_outbound: number;
  }[];
  acquisition: { name: string; visitors: number; generations: number; outbound_visitors: number }[];
  source_options: string[];
  medium_options: string[];
  campaign_options: string[];
};

export function rate(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export function formatRate(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export function deriveMetrics(t: GrowthTotals, cohort?: StartCohort) {
  return {
    // Start-cohort rate: of visitors who started in the period, the share who
    // completed afterwards within it. Raw event counts are never divided, since
    // completions can arrive without a recorded start. In an answer segment,
    // every completer is in the cohort by definition, so the rate is withheld.
    completionRate: t.segmented || !cohort ? null : rate(cohort.completed, cohort.started),
    // Pre-AI rejections are not generation failures.
    generationSuccessRate: rate(t.gen_ok, t.gen_ok + t.gen_fail),
    shareRate: rate(t.shared_projects, t.gen_ok),
    niatOutboundRate: rate(t.niat_outbound_visitors, t.visitors),
    qualifiedReferralRate: rate(t.qualified_referrals, t.ref_visitors),
  };
}

export function isEmptyReport(t: GrowthTotals): boolean {
  return t.visitors === 0;
}

/** Last N days inclusive of today, as UTC dates. */
export function presetRange(days: number, now = new Date()): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: start.toISOString().slice(0, 10), to };
}
