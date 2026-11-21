import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { GraduationCap, LockKeyhole, Users } from "lucide-react";
import { z } from "zod";

import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/projects";
import { destinationFor, primaryRole } from "@/lib/roles";
import { DEMO_ACCOUNTS, type DemoRole } from "@/lib/demo-accounts";
import { ensureDemoAccount } from "@/lib/demo-login.functions";
import { recordStudentActivity } from "@/lib/student-activity.functions";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () =>
    pageHead(
      "Sign in",
      "Sign in to FutureMe Family: students see their projects; counsellors and the team see their dashboards.",
    ),
  component: AuthPage,
});

/** Reads the signed-in user's own roles (RLS limits this to their rows). */
async function roleOf(userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return primaryRole((data ?? []).map((row) => String(row.role)));
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const recordActivity = useServerFn(recordStudentActivity);
  const ensureAccount = useServerFn(ensureDemoAccount);
  const [pending, setPending] = useState<DemoRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function goHome(userId: string, fresh = false) {
    const role = await roleOf(userId);
    if (!role) {
      await supabase.auth.signOut();
      setError(
        "This account doesn't have access yet. Ask the FutureMe Family team to set up your account.",
      );
      return false;
    }
    queryClient.removeQueries({ queryKey: ["identity"] });
    if (role === "student" && fresh) {
      await recordActivity({ data: { events: [{ kind: "login" }] } }).catch(() => undefined);
      try {
        // The login already counts as this session's visit.
        sessionStorage.setItem("fm_student_session", "1");
      } catch {
        // ignore
      }
    }
    navigate({ to: destinationFor(role, search.redirect), replace: true });
    return true;
  }

  // Already signed in: go straight to the right place.
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user) void goHome(data.user.id);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loginAs(role: DemoRole) {
    setPending(role);
    setError(null);
    await ensureAccount({ data: { role } }).catch(() => undefined);
    const account = DEMO_ACCOUNTS[role];
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
    if (signInError || !data.user) {
      setPending(null);
      setError("Sign-in didn't work. Please try again.");
      return;
    }
    const ok = await goHome(data.user.id, true);
    if (!ok) setPending(null);
  }

  return (
    <SiteShell>
      <section className="auth-page page-width">
        <div className="auth-card">
          <span className="auth-icon">
            <LockKeyhole size={20} />
          </span>
          <h1>Sign in</h1>
          <p>Demo site: pick who you want to sign in as.</p>
          <ul className="auth-roles" aria-label="Who signs in here">
            <li>
              <GraduationCap size={16} aria-hidden="true" /> Students: your projects, Parent Briefs
              and next steps
            </li>
            <li>
              <Users size={16} aria-hidden="true" /> Counsellors and team: leads and dashboards
            </li>
          </ul>
          <div className="auth-form">
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
            <Button
              type="button"
              variant="premium"
              size="lg"
              disabled={pending !== null}
              onClick={() => void loginAs("student")}
            >
              <GraduationCap size={18} aria-hidden="true" />
              {pending === "student" ? "Signing in…" : "Login as Student"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={pending !== null}
              onClick={() => void loginAs("counsellor")}
            >
              <Users size={18} aria-hidden="true" />
              {pending === "counsellor" ? "Signing in…" : "Login as Counsellor"}
            </Button>
          </div>
          <p className="auth-foot">
            Or{" "}
            <Link to="/discover" className="text-link">
              explore without signing in
            </Link>
            .
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
