import { createFileRoute } from "@tanstack/react-router";

import { trackPayloadSchema } from "@/lib/tracking";
import { isSameOrigin, recordGrowthEvent } from "@/lib/growth.server";
import { resolveVisitor } from "@/lib/visitor-session.server";

export const Route = createFileRoute("/api/track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOrigin(request)) return new Response(null, { status: 403 });
        const body: unknown = await request.json().catch(() => null);
        const parsed = trackPayloadSchema.safeParse(body);
        if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
        const p = parsed.data;
        const visitor = await resolveVisitor(request);
        const result = await recordGrowthEvent({
          event: p.event,
          visitorHash: visitor.hash,
          projectId: p.project_id,
          ref: p.ref,
          channel: p.channel,
          cta: p.cta,
          utm_source: p.utm_source,
          utm_medium: p.utm_medium,
          utm_campaign: p.utm_campaign,
        });
        const res = Response.json(
          { ok: result === "ok" || result === "ignored" },
          { status: result === "rate_limited" ? 429 : 200 },
        );
        if (visitor.setCookie) res.headers.append("set-cookie", visitor.setCookie);
        return res;
      },
    },
  },
});
