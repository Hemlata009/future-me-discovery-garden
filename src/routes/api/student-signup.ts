import { createFileRoute } from "@tanstack/react-router";

import { handleStudentSignup } from "@/lib/student-signup.server";

export const Route = createFileRoute("/api/student-signup")({
  server: { handlers: { POST: ({ request }) => handleStudentSignup(request) } },
});
