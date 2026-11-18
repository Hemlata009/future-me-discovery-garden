import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LEAD_STATUSES } from "@/lib/counsellor-metrics";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const counsellorRangeSchema = z
  .object({ from: date, to: date })
  .strict()
  .refine((value) => value.from <= value.to, "from must be before to")
  .refine(
    (value) => (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 <= 366,
    "range too long",
  );

const nullableDate = z.string().datetime({ offset: true }).nullable().optional();
export const updateLeadSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(LEAD_STATUSES).optional(),
    assigned_to: z.string().uuid().nullable().optional(),
    next_follow_up_at: nullableDate,
    last_contacted_at: nullableDate,
    call_outcome: z
      .enum([
        "reached",
        "no_answer",
        "busy",
        "wrong_number",
        "callback_requested",
        "not_interested",
      ])
      .nullable()
      .optional(),
    internal_notes: z.string().max(2000).optional(),
  })
  .strict();

export const getCounsellorWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => counsellorRangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { runCounsellorWorkspace } = await import("@/lib/counsellor-workspace.server");
    return runCounsellorWorkspace(context, data);
  });

export const getCounsellorLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { runCounsellorLead } = await import("@/lib/counsellor-workspace.server");
    return runCounsellorLead(context, data.id);
  });

export const revealCounsellorPhone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { runRevealCounsellorPhone } = await import("@/lib/counsellor-workspace.server");
    return runRevealCounsellorPhone(context, data.id);
  });

export const updateCounsellorLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateLeadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { runUpdateCounsellorLead } = await import("@/lib/counsellor-workspace.server");
    return runUpdateCounsellorLead(context, data);
  });
