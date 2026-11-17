import { createFileRoute } from "@tanstack/react-router";

import { handleParentQuestion } from "@/lib/parent-question.server";

export const Route = createFileRoute("/api/parent-question")({
  server: { handlers: { POST: ({ request }) => handleParentQuestion(request) } },
});
