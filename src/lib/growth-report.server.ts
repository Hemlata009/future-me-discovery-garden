// Server-side only: the admin check and the report read behind getGrowthReport.
import { matchStartCohort, type GrowthReport, type StartCohort } from "@/lib/growth-metrics";
import type { ReportFilters, ReportResult } from "@/lib/growth-report.functions";
import { compact } from "@/lib/growth.server";

type RoleClient = {
  rpc: (
    fn: "has_role",
    args: { _user_id: string; _role: "admin" },
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** Checks the caller's admin role on every request before reading anything. */
export async function runGrowthReport(
  context: { supabase: unknown; userId: string },
  data: ReportFilters,
): Promise<ReportResult> {
  const roles = context.supabase as RoleClient;
  const { data: isAdmin, error: roleError } = await roles.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (roleError || isAdmin !== true) return { access: "denied" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const args = compact({
    _from: data.from,
    _to: data.to,
    _utm_source: data.utm_source || undefined,
    _utm_medium: data.utm_medium || undefined,
    _utm_campaign: data.utm_campaign || undefined,
    _interest: data.interest,
    _technology: data.technology,
    _language: data.language,
    _class_status: data.class_status,
  });
  const { data: report, error } = await supabaseAdmin.rpc(
    "growth_report",
    args as { _from: string; _to: string },
  );
  if (error || !report) {
    console.error(JSON.stringify({ msg: "growth_report_failed", error: error?.message }));
    throw new Error("The report couldn't be loaded. Please try again.");
  }
  const { data: journey, error: journeyError } = await supabaseAdmin.rpc(
    "referral_journey_report",
    compact({
      _from: data.from,
      _to: data.to,
      _utm_source: data.utm_source || undefined,
      _utm_medium: data.utm_medium || undefined,
      _utm_campaign: data.utm_campaign || undefined,
    }) as { _from: string; _to: string },
  );
  if (journeyError) {
    console.error(JSON.stringify({ msg: "referral_journey_failed", error: journeyError.message }));
  }
  const full = report as unknown as GrowthReport;
  const cohort = await readStartCohort(supabaseAdmin, data).catch((e: unknown) => {
    console.error(JSON.stringify({ msg: "start_cohort_failed", error: String(e) }));
    return null;
  });
  if (cohort) full.start_cohort = cohort;
  if (!journeyError && journey)
    full.referral_journey = journey as unknown as NonNullable<GrowthReport["referral_journey"]>;
  return { access: "ok", report: full };
}

type Row = { visitor_hash: string; created_at: string };
const PAGE = 1000;

/**
 * Reads discovery starts and completions in the period (UTC dates, inclusive)
 * and matches them per visitor. Source/medium/campaign filters use first-touch
 * attribution, like the main report. Throws on any read error so the rate is
 * shown as unavailable rather than computed from partial data.
 */
async function readStartCohort(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  f: ReportFilters,
): Promise<StartCohort> {
  let allowed: Set<string> | null = null;
  const utm = { utm_source: f.utm_source, utm_medium: f.utm_medium, utm_campaign: f.utm_campaign };
  if (utm.utm_source || utm.utm_medium || utm.utm_campaign) {
    allowed = new Set();
    for (let from = 0; ; from += PAGE) {
      let q = db.from("visitor_attribution").select("visitor_hash");
      for (const [k, v] of Object.entries(utm)) if (v) q = q.eq(k, v);
      const { data, error } = await q.order("visitor_hash").range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const r of data as { visitor_hash: string }[]) allowed.add(r.visitor_hash);
      if (data.length < PAGE) break;
    }
  }
  const read = async (event: string): Promise<Row[]> => {
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from("growth_events")
        .select("visitor_hash, created_at")
        .eq("event_name", event)
        .gte("event_date", f.from)
        .lte("event_date", f.to)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...(data as Row[]));
      if (data.length < PAGE) break;
    }
    return allowed ? rows.filter((r) => allowed.has(r.visitor_hash)) : rows;
  };
  const [starts, completions] = await Promise.all([
    read("discovery_started"),
    read("discovery_completed"),
  ]);
  return matchStartCohort(starts, completions);
}
