import { createFileRoute } from "@tanstack/react-router";

import { handleParentBrief } from "@/lib/parent-brief.server";

export const Route = createFileRoute("/api/parent-brief")({
  server: { handlers: { POST: ({ request }) => handleParentBrief(request) } },
});
