import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Compass, LogOut, Sparkles, UserRound, Users } from "lucide-react";
import type { ReactNode } from "react";

import { Brand } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";
import { recordStudentActivity } from "@/lib/student-activity.functions";
import { useIdentity } from "@/lib/use-identity";

const NAV: Record<AppRole, { to: string; label: string; icon: typeof Users }[]> = {
  admin: [
    { to: "/admin", label: "Growth", icon: BarChart3 },
    { to: "/counsellor", label: "Counsellor CRM", icon: Users },
  ],
  counsellor: [{ to: "/counsellor", label: "My leads", icon: Users }],
  student: [
    { to: "/me", label: "My FutureMe", icon: UserRound },
    { to: "/discover", label: "Start a discovery", icon: Compass },
  ],
};

/**
 * One header for every signed-in page, matching the public site's header, so
 * students, counsellors and admins all use the same app.
 */
export function TeamShell({ children }: { children: ReactNode }) {
  const identity = useIdentity();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const recordActivity = useServerFn(recordStudentActivity);
  const role = identity.data?.role ?? null;

  async function signOut() {
    if (role === "student")
      await recordActivity({ data: { events: [{ kind: "logout" }] } }).catch(() => undefined);
    try {
      sessionStorage.removeItem("fm_student_session");
    } catch {
      // ignore
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="team-shell">
      <header className="site-header team-header">
        <div className="page-width header-inner">
          <Brand />
          {role && (
            <nav className="team-nav" aria-label="Signed-in navigation">
              {NAV[role].map((item) => (
                <Link key={item.to} to={item.to} activeProps={{ className: "nav-active" }}>
                  <item.icon size={15} aria-hidden="true" /> {item.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="team-user">
            {identity.data?.email && (
              <span className="team-email" title={identity.data.email}>
                {identity.data.email}
              </span>
            )}
            {role && <span className="role-pill">{ROLE_LABELS[role]}</span>}
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut size={15} /> <span className="team-signout-label">Sign out</span>
            </Button>
          </div>
        </div>
        {role && (
          <nav className="team-nav-mobile page-width" aria-label="Signed-in navigation (mobile)">
            {NAV[role].map((item) => (
              <Link key={item.to} to={item.to} activeProps={{ className: "nav-active" }}>
                <item.icon size={14} aria-hidden="true" /> {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="team-main page-width">{children}</main>
      <footer className="team-footer page-width">
        <Sparkles size={14} aria-hidden="true" /> FutureMe Family · Explore first. Decide together.
      </footer>
    </div>
  );
}
