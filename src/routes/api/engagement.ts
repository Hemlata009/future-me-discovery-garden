import { createFileRoute } from "@tanstack/react-router";

import { handleEngagement } from "@/lib/engagement-handler.server";

export const Route = createFileRoute("/api/engagement")({
  server: {
    handlers: {
      POST: ({ request }) => handleEngagement(request),
    },
  },
});
