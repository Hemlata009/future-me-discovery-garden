import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ChartNoAxesCombined, LogOut, Users } from "lucide-react";

import { GrowthAdminShell } from "@/components/admin-growth";
import { Brand } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchReport = useServerFn(getGrowthReport);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="admin-layout gd-layout">
      <aside className="admin-sidebar">
        <Brand />
        <nav>
          <span className="admin-nav-item">
            <ChartNoAxesCombined size={17} />
            Growth overview
          </span>
          <Link className="admin-nav-link" to="/counsellor">
            <Users size={17} />
            Counsellor CRM
          </Link>
        </nav>
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut size={15} />
          Sign out
        </Button>
        <Link className="admin-back" to="/">
          <ArrowLeft size={15} />
          Back to discovery
        </Link>
      </aside>
      <main className="admin-main gd-main">
        <GrowthAdminShell fetchReport={fetchReport} />
      </main>
    </div>
  );
}
