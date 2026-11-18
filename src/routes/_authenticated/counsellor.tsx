import { createFileRoute } from "@tanstack/react-router";

import { CounsellorDashboard } from "@/components/counsellor-dashboard";
import { pageHead } from "@/lib/projects";

export const Route = createFileRoute("/_authenticated/counsellor")({
  head: () =>
    pageHead(
      "Counsellor lead intelligence",
      "Secure follow-up, engagement evidence and lead analytics for authorised FutureMe Family counsellors.",
    ),
  component: CounsellorDashboard,
});
