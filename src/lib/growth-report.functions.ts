import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { discoveryAnswersSchema } from "@/lib/project-generation";
import type { GrowthReport } from "@/lib/growth-metrics";

const shape = discoveryAnswersSchema.shape;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const filtersSchema = z
  .object({
    from: date,
    to: date,
    utm_source: z.string().max(100).optional(),
    utm_medium: z.string().max(100).optional(),
    utm_campaign: z.string().max(100).optional(),
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
    const { runGrowthReport } = await import("@/lib/growth-report.server");
    return runGrowthReport(context, data);
  });
