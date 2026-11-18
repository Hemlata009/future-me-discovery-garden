import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { GraduationCap, LockKeyhole, Users } from "lucide-react";
import { z } from "zod";

import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/projects";
import { destinationFor, primaryRole } from "@/lib/roles";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function goHome(userId: string) {
    const role = await roleOf(userId);
    if (!role) {
      await supabase.auth.signOut();
      setError(
        "This account doesn't have access yet. Ask the FutureMe Family team to set up your account.",
      );
      return false;
    }
    queryClient.removeQueries({ queryKey: ["identity"] });
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError || !data.user) {
      setPending(false);
      setError("That email and password didn't match an account.");
      return;
    }
    const ok = await goHome(data.user.id);
    if (!ok) setPending(false);
  }

  return (
    <SiteShell>
      <section className="auth-page page-width">
        <div className="auth-card">
          <span className="auth-icon">
            <LockKeyhole size={20} />
          </span>
          <h1>Sign in</h1>
          <p>One sign-in for everyone. We'll take you to the right place.</p>
          <ul className="auth-roles" aria-label="Who signs in here">
            <li>
              <GraduationCap size={16} aria-hidden="true" /> Students: your projects, Parent Briefs
              and next steps
            </li>
            <li>
              <Users size={16} aria-hidden="true" /> Counsellors and team: leads and dashboards
            </li>
          </ul>
          <form className="auth-form" onSubmit={submit}>
            <label className="family-field">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="family-field">
              Password
              <input
                type="password"
                required
                minLength={8}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
            <Button type="submit" variant="premium" size="lg" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="auth-foot">
            New here? You don't need an account to explore.{" "}
            <Link to="/discover" className="text-link">
              Start a discovery
            </Link>
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
