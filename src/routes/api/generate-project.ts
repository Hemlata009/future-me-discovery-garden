import { createFileRoute } from "@tanstack/react-router";

import { handleGenerateProject } from "@/lib/generate-project.server";

export const Route = createFileRoute("/api/generate-project")({
  server: {
    handlers: {
      POST: ({ request }) => handleGenerateProject(request),
    },
  },
});
