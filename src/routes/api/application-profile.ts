import { createFileRoute } from "@tanstack/react-router";

import { handleApplicationProfile } from "@/lib/application-profile.server";

export const Route = createFileRoute("/api/application-profile")({
  server: {
    handlers: {
      GET: ({ request }) => handleApplicationProfile(request),
      PUT: ({ request }) => handleApplicationProfile(request),
      DELETE: ({ request }) => handleApplicationProfile(request),
    },
  },
});
