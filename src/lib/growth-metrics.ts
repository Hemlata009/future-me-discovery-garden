// Browser-safe: turns the database's raw counts into dashboard metrics.
// Every rate is null (shown as "—") when its denominator is zero, never a guess.

export type GrowthTotals = {
  visitors: number;
  starts: number;
  completions: number;
  gen_ok: number;
  gen_fail: number;
  shares: number;
  shared_projects: number;
  ref_visits: number;
  ref_visitors: number;
  ref_starts: number;
  ref_gens: number;
  cta: number;
  ref_cta: number;
  views: number;
};

export type Named = { name: string | null; value: number };
export type GrowthReport = {
  totals: GrowthTotals;
  shares_by_channel: Record<string, number>;
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
    cta: number;
  }[];
  acquisition: { name: string; visitors: number; generations: number; cta_visitors: number }[];
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
    completionRate: rate(t.completions, t.starts),
    generationSuccessRate: rate(t.gen_ok, t.gen_ok + t.gen_fail),
    shareRate: rate(t.shared_projects, t.gen_ok),
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
