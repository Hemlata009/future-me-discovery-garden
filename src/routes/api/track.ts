import { createFileRoute } from "@tanstack/react-router";

import { handleTrack } from "@/lib/track-handler.server";

export const Route = createFileRoute("/api/track")({
  server: {
    handlers: {
      POST: ({ request }) => handleTrack(request),
    },
  },
});
