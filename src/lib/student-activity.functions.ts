import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const eventSchema = z
  .object({
    kind: z.enum(["page_view", "login", "logout", "return_visit", "invite_created"]),
    path: z
      .string()
      .max(200)
      .regex(/^\/[A-Za-z0-9/_-]*$/)
      .optional(),
    seconds: z.number().int().min(0).max(3600).optional(),
    detail: z.enum(["parent", "friend"]).optional(),
    at: z.string().datetime().optional(),
  })
  .strict();

export const recordStudentActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ events: z.array(eventSchema).min(1).max(100) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { runRecordStudentActivity } = await import("@/lib/student-signup.server");
    return runRecordStudentActivity(context, data.events);
  });
