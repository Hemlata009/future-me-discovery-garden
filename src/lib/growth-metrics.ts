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
  niat_modal_opens: number;
  niat_outbound: number;
  niat_outbound_visitors: number;
  ref_niat_outbound: number;
  views: number;
};

export type Named = { name: string | null; value: number };
export type GrowthReport = {
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

export function deriveMetrics(t: GrowthTotals) {
  return {
    // In a segment, every completer is in the cohort by definition, so a
    // completion rate would always read 100%; it is withheld instead.
    completionRate: t.segmented || t.starts === null ? null : rate(t.completions, t.starts),
    // Pre-AI rejections are not generation failures.
    generationSuccessRate: rate(t.gen_ok, t.gen_ok + t.gen_fail),
    shareRate: rate(t.shared_projects, t.gen_ok),
    niatOutboundRate: rate(t.niat_outbound_visitors, t.visitors),
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
