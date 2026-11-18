import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { GrowthAdminShell } from "@/components/admin-growth";
import { TeamShell } from "@/components/team-shell";
import { getGrowthReport } from "@/lib/growth-report.functions";
import { pageHead } from "@/lib/projects";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () =>
    pageHead(
      "Growth dashboard",
      "Visitor, discovery, generation, sharing and referral analytics for FutureMe Family.",
    ),
  component: Admin,
});

function Admin() {
  const fetchReport = useServerFn(getGrowthReport);
  return (
    <TeamShell>
      <GrowthAdminShell fetchReport={fetchReport} />
    </TeamShell>
  );
}
