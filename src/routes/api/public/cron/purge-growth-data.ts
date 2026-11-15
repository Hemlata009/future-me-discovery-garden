import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Scheduled retention cleanup: 30 days of limit records, 13 months of activity. */
export const Route = createFileRoute("/api/public/cron/purge-growth-data")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("purge_expired_growth_data", {});
        if (error) {
          console.error(JSON.stringify({ msg: "retention_purge_failed", error: error.message }));
          return Response.json({ ok: false }, { status: 500 });
        }
        console.info(JSON.stringify({ msg: "retention_purge", ...(data as object) }));
        return Response.json({ ok: true, result: data });
      },
    },
  },
});
