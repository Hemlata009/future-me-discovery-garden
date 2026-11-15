import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { isSameOrigin, newReferralCode } from "@/lib/growth.server";
import { resolveVisitor } from "@/lib/visitor-session.server";

const bodySchema = z.object({ project_id: z.string().uuid() }).strict();

/** Returns this visitor's referral code for a saved AI project, creating it once. */
export const Route = createFileRoute("/api/referral-link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOrigin(request)) return new Response(null, { status: 403 });
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ ok: false }, { status: 400 });
        const visitor = await resolveVisitor(request);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const projectId = parsed.data.project_id;

        const reply = (body: object, status = 200) => {
          const res = Response.json(body, { status });
          if (visitor.setCookie) res.headers.append("set-cookie", visitor.setCookie);
          return res;
        };

        const { data: project } = await supabaseAdmin
          .from("generated_projects")
          .select("id")
          .eq("id", projectId)
          .maybeSingle();
        if (!project) return reply({ ok: false }, 404);

        const existing = await supabaseAdmin
          .from("referral_links")
          .select("code")
          .eq("generated_project_id", projectId)
          .eq("owner_visitor_hash", visitor.hash)
          .maybeSingle();
        if (existing.data) return reply({ ok: true, code: existing.data.code });

        for (let attempt = 0; attempt < 3; attempt++) {
          const code = newReferralCode();
          const { error } = await supabaseAdmin.from("referral_links").insert({
            code,
            generated_project_id: projectId,
            owner_visitor_hash: visitor.hash,
          });
          if (!error) return reply({ ok: true, code });
          // A concurrent request may have created this visitor's link first.
          const again = await supabaseAdmin
            .from("referral_links")
            .select("code")
            .eq("generated_project_id", projectId)
            .eq("owner_visitor_hash", visitor.hash)
            .maybeSingle();
          if (again.data) return reply({ ok: true, code: again.data.code });
        }
        return reply({ ok: false }, 500);
      },
    },
  },
});
