import { createFileRoute } from "@tanstack/react-router";

import { handleInviteVisit } from "@/lib/student-signup.server";

export const Route = createFileRoute("/api/invite-visit")({
  server: { handlers: { POST: ({ request }) => handleInviteVisit(request) } },
});
