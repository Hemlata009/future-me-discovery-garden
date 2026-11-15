import { createFileRoute } from "@tanstack/react-router";

import { resolveVisitor } from "@/lib/visitor-session.server";

/** Issues the anonymous visitor cookie once, before any other request needs it. */
export const Route = createFileRoute("/api/visitor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const visitor = await resolveVisitor(request);
        const res = new Response(null, { status: 204 });
        if (visitor.setCookie) res.headers.append("set-cookie", visitor.setCookie);
        return res;
      },
    },
  },
});
