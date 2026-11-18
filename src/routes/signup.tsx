import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState, type FormEvent } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { z } from "zod";

import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/projects";
import { destinationFor } from "@/lib/roles";
import {
  clearJourney,
  exploreSeconds,
  promptCount,
  readJourney,
  storedInvite,
} from "@/lib/student-journey";
import {
  CLASS_OPTIONS,
  STUDENT_SIGNUP_ENDPOINT,
  studentSignupSchema,
  type StudentSignup,
} from "@/lib/student-signup";
import { ensureVisitor } from "@/lib/tracking";

export const Route = createFileRoute("/signup")({
  validateSearch: z.object({ next: z.string().optional() }),
  head: () =>
    pageHead(
      "Create your free account",
      "Save your FutureMe Family exploration for free and invite your family to explore with you.",
    ),
  component: SignupPage,
});

type Fields = Omit<StudentSignup, "consent" | "journey" | "prompts" | "invite">;
const MESSAGES: Record<string, string> = {
  full_name: "Enter your name (2–80 characters).",
  email: "Enter a valid email address.",
  password: "Use at least 8 characters.",
  phone: "Enter a valid 10-digit Indian mobile number.",
  class_status: "Choose one.",
  city: "Enter your city or leave it empty.",
  consent: "Please tick the consent box.",
};

function SignupPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const uid = useId();
  const [values, setValues] = useState<Fields>({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    class_status: "class12",
    city: "",
    language: "english",
  });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState({ pages: 0, minutes: 0 });

  useEffect(() => {
    setSaved({
      pages: new Set(readJourney().map((entry) => entry.path)).size,
      minutes: Math.floor(exploreSeconds() / 60),
    });
  }, []);

  const set = (key: keyof Fields, value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const payload = {
      ...values,
      consent,
      journey: readJourney()
        .filter((entry) => /^\/[A-Za-z0-9/_-]*$/.test(entry.path))
        .slice(-150),
      prompts: Math.min(10, promptCount()),
      invite: storedInvite(),
    };
    const parsed = studentSignupSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            MESSAGES[String(issue.path[0])] ?? "Check this field.",
          ]),
        ),
      );
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await ensureVisitor();
      const response = await fetch(STUDENT_SIGNUP_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = (await response.json()) as {
        ok: boolean;
        message?: string;
        fields?: string[];
      };
      if (!result.ok) {
        setPending(false);
        if (result.fields?.length)
          setErrors(
            Object.fromEntries(result.fields.map((f) => [f, MESSAGES[f] ?? "Check this field."])),
          );
        setError(result.message ?? "Your account couldn't be created. Please try again.");
        return;
      }
      clearJourney();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (signInError) {
        setPending(false);
        setError("Your account is ready. Please sign in.");
        return;
      }
      try {
        // The sign-up already counts as this session's visit.
        sessionStorage.setItem("fm_student_session", "1");
      } catch {
        // ignore
      }
      queryClient.removeQueries({ queryKey: ["identity"] });
      navigate({ to: destinationFor("student", search.next ?? "/me"), replace: true });
    } catch {
      setPending(false);
      setError("We couldn't reach the site. Check your connection and try again.");
    }
  }

  const field = (
    key: keyof Fields,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="family-field">
      <label htmlFor={`${uid}-${key}`}>{label}</label>
      <input
        id={`${uid}-${key}`}
        value={values[key]}
        onChange={(e) =>
          set(
            key,
            key === "phone" ? e.target.value.replace(/\D/g, "").slice(0, 10) : e.target.value,
          )
        }
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `${uid}-${key}-error` : undefined}
        {...props}
      />
      {errors[key] && (
        <p id={`${uid}-${key}-error`} className="field-error">
          {errors[key]}
        </p>
      )}
    </div>
  );

  return (
    <SiteShell>
      <section className="auth-page page-width">
        <div className="auth-card signup-card">
          <span className="auth-icon">
            <Sparkles size={20} />
          </span>
          <h1>Create your free account</h1>
          <p>A few basic details and you're in. No fees, no application.</p>
          {(saved.pages > 0 || saved.minutes > 0) && (
            <p className="signup-saved" role="status">
              <CheckCircle2 size={16} /> We'll save what you've explored: {saved.pages} page
              {saved.pages === 1 ? "" : "s"}
              {saved.minutes ? `, ${saved.minutes} min` : ""}.
            </p>
          )}
          <form className="auth-form" onSubmit={(e) => void submit(e)} noValidate>
            {field("full_name", "Your full name", { autoComplete: "name", maxLength: 80 })}
            {field("email", "Email", { type: "email", autoComplete: "email", maxLength: 120 })}
            {field("phone", "Mobile number", {
              inputMode: "numeric",
              autoComplete: "tel",
              maxLength: 10,
              placeholder: "10-digit mobile",
            })}
            {field("password", "Create a password", {
              type: "password",
              autoComplete: "new-password",
              minLength: 8,
              maxLength: 72,
            })}
            <div className="signup-row">
              <label className="family-field">
                Where are you now?
                <select
                  value={values.class_status}
                  onChange={(e) => set("class_status", e.target.value)}
                >
                  {CLASS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="family-field">
                Language
                <select value={values.language} onChange={(e) => set("language", e.target.value)}>
                  <option value="english">English</option>
                  <option value="hindi">हिन्दी · Hindi</option>
                  <option value="telugu">తెలుగు · Telugu</option>
                </select>
              </label>
            </div>
            {field("city", "City (optional)", { autoComplete: "address-level2", maxLength: 60 })}
            <label className="consent-field">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                aria-invalid={Boolean(errors["consent"])}
              />
              <span>
                I agree that FutureMe Family saves my exploration to this account and that a NIAT
                counsellor may contact me about it. This is not an application.
              </span>
            </label>
            {errors["consent"] && <p className="field-error">{errors["consent"]}</p>}
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
            <Button type="submit" variant="premium" size="lg" disabled={pending}>
              {pending ? "Creating your account…" : "Create free account"}
            </Button>
          </form>
          <p className="auth-foot">
            Already have an account?{" "}
            <Link to="/auth" className="text-link">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
