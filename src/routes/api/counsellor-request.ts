import { createFileRoute } from "@tanstack/react-router";

import { handleCounsellorRequest } from "@/lib/counsellor-request.server";

export const Route = createFileRoute("/api/counsellor-request")({
  server: { handlers: { POST: ({ request }) => handleCounsellorRequest(request) } },
});
