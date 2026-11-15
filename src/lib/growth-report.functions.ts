import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { discoveryAnswersSchema } from "@/lib/project-generation";
import type { GrowthReport } from "@/lib/growth-metrics";

const shape = discoveryAnswersSchema.shape;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const filtersSchema = z
  .object({
    from: date,
    to: date,
    campaign: z.string().max(100).optional(),
    interest: shape.interest.optional(),
    technology: shape.technology.optional(),
    language: shape.language.optional(),
    class_status: shape.class_status.optional(),
  })
  .strict()
  .refine((f) => f.from <= f.to, "from must be before to")
  .refine((f) => (Date.parse(f.to) - Date.parse(f.from)) / 86_400_000 <= 366, "range too long");
export type ReportFilters = z.infer<typeof filtersSchema>;

export type ReportResult = { access: "denied" } | { access: "ok"; report: GrowthReport };

/** Admin-only: checks the caller's role on every request before reading anything. */
export const getGrowthReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => filtersSchema.parse(input))
  .handler(async ({ data, context }): Promise<ReportResult> => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || isAdmin !== true) return { access: "denied" };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { compact } = await import("@/lib/growth.server");
    const args = compact({
      _from: data.from,
      _to: data.to,
      _campaign: data.campaign || undefined,
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
      console.error("Growth report failed", error?.message);
      throw new Error("The report couldn't be loaded. Please try again.");
    }
    return { access: "ok", report: report as unknown as GrowthReport };
  });
