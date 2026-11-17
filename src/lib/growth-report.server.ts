// Server-side only: the admin check and the report read behind getGrowthReport.
import type { GrowthReport } from "@/lib/growth-metrics";
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
  if (!journeyError && journey)
    full.referral_journey = journey as unknown as NonNullable<GrowthReport["referral_journey"]>;
  return { access: "ok", report: full };
}
