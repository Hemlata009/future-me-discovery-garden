import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/projects";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () =>
    pageHead("Team sign in", "Sign in to the FutureMe AI growth dashboard for the NxtWave team."),
  component: AuthPage,
});

function safePath(path: string | undefined): string {
  return path && path.startsWith("/") && !path.startsWith("//") ? path : "/admin";
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (error) {
      setError("That email and password didn't match an account.");
      return;
    }
    navigate({ to: safePath(search.redirect), replace: true });
  }

  return (
    <div className="admin-layout">
      <main className="admin-main mx-auto w-full max-w-md">
        <Brand />
        <div className="chart-panel mt-8">
          <LockKeyhole className="text-primary" />
          <h1 className="mt-3 text-2xl font-semibold">Team sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The growth dashboard is for the FutureMe AI team. Students don't need an account. Team
            accounts are by invitation only.
          </p>
          <form className="mt-6 grid gap-3" onSubmit={submit}>
            <label className="grid gap-1 text-sm">
              Email
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
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
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="notice text-sm">
                {message}
              </p>
            )}
            <Button type="submit" variant="premium" disabled={pending}>
              {pending ? "Please wait…" : "Sign in"}
            </Button>
          </form>
        </div>
        <Link className="admin-back mt-6" to="/">
          <ArrowLeft size={15} />
          Back to discovery
        </Link>
      </main>
    </div>
  );
}
