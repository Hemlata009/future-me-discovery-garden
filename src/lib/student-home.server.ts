// Server-only "My FutureMe" read. The caller must hold the student role. Data is
// found through public.student_accounts (user → visitor id) and read with the
// service client; counsellor notes, assignee identities and other people's data
// are never returned.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";

import { readVisitor } from "@/lib/visitor-session.server";

type Context = { supabase: unknown; userId: string };

export type StudentHome =
  | { access: "denied" }
  | { access: "not_ready" }
  | {
      access: "ok";
      linked: boolean;
      projects: {
        id: string;
        title: string;
        tagline: string;
        interest: string;
        technology: string;
        language: string;
        created_at: string;
      }[];
      briefs: { id: string; project_id: string; language: string; created_at: string }[];
      profile: {
        student_name: string;
        city: string;
        state: string;
        qualification: string;
        intended_course: string;
        updated_at: string;
      } | null;
      requests: {
        status: string;
        created_at: string;
        has_counsellor: boolean;
        next_follow_up_at: string | null;
        last_contacted_at: string | null;
      }[];
      steps: Record<
        "discovery" | "project" | "demo" | "brief" | "brief_shared" | "counsellor" | "application",
        boolean
      >;
      active_seconds: number;
    };

const MISSING = new Set(["PGRST205", "42P01"]);

export async function runStudentHome(context: Context): Promise<StudentHome> {
  const roles = context.supabase as {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "student" },
    ) => PromiseLike<{
      data: unknown;
      error: unknown;
    }>;
  };
  const { data: isStudent, error: roleError } = await roles.rpc("has_role", {
    _user_id: context.userId,
    _role: "student",
  });
  if (roleError || isStudent !== true) return { access: "denied" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;
  const account = await db
    .from("student_accounts")
    .select("visitor_hash")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (account.error && MISSING.has(account.error.code)) return { access: "not_ready" };
  if (account.error) throw new Error("Your FutureMe page couldn't be loaded.");

  let hash: string | null = account.data?.visitor_hash ?? null;
  if (!hash) {
    // First sign-in from a browser that already explored: link that activity once.
    const visitor = await readVisitor(getRequest());
    if (visitor) {
      const { error } = await db
        .from("student_accounts")
        .upsert({ user_id: context.userId, visitor_hash: visitor }, { onConflict: "user_id" });
      if (!error) hash = visitor;
    }
  }
  const empty = {
    access: "ok" as const,
    linked: false,
    projects: [],
    briefs: [],
    profile: null,
    requests: [],
    steps: {
      discovery: false,
      project: false,
      demo: false,
      brief: false,
      brief_shared: false,
      counsellor: false,
      application: false,
    },
    active_seconds: 0,
  };
  if (!hash) return empty;

  const [projects, profile, requests, events, beats] = await Promise.all([
    db
      .from("generated_projects")
      .select("id, interest, technology, language, created_at, generated_content")
      .eq("owner_visitor_hash", hash)
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("pre_application_profiles")
      .select("student_name, city, state, qualification, intended_course, updated_at")
      .eq("visitor_hash", hash)
      .maybeSingle(),
    db
      .from("counsellor_requests")
      .select("status, created_at, assigned_to, next_follow_up_at, last_contacted_at")
      .eq("visitor_hash", hash)
      .order("created_at", { ascending: false }),
    db.from("growth_events").select("event_name, cta").eq("visitor_hash", hash).limit(2000),
    db.from("engagement_heartbeats").select("active_seconds").eq("visitor_hash", hash).limit(5000),
  ]);
  if (projects.error || requests.error || events.error)
    throw new Error("Your FutureMe page couldn't be loaded.");

  const projectRows = (projects.data ?? []) as {
    id: string;
    interest: string;
    technology: string;
    language: string;
    created_at: string;
    generated_content: { title?: unknown; tagline?: unknown };
  }[];
  const briefs = projectRows.length
    ? await db
        .from("parent_briefs")
        .select("id, generated_project_id, language, created_at")
        .in(
          "generated_project_id",
          projectRows.map((p) => p.id),
        )
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  const names = new Set(
    ((events.data ?? []) as { event_name: string; cta: string | null }[]).map((e) =>
      e.event_name === "cta_clicked" ? `cta:${e.cta}` : e.event_name,
    ),
  );
  return {
    access: "ok",
    linked: true,
    projects: projectRows.map((p) => ({
      id: p.id,
      title:
        typeof p.generated_content?.title === "string" ? p.generated_content.title : "My project",
      tagline: typeof p.generated_content?.tagline === "string" ? p.generated_content.tagline : "",
      interest: p.interest,
      technology: p.technology,
      language: p.language,
      created_at: p.created_at,
    })),
    briefs: (
      (briefs.data ?? []) as {
        id: string;
        generated_project_id: string;
        language: string;
        created_at: string;
      }[]
    ).map((b) => ({
      id: b.id,
      project_id: b.generated_project_id,
      language: b.language,
      created_at: b.created_at,
    })),
    profile: profile.error ? null : ((profile.data as never) ?? null),
    requests: (
      (requests.data ?? []) as {
        status: string;
        created_at: string;
        assigned_to: string | null;
        next_follow_up_at: string | null;
        last_contacted_at: string | null;
      }[]
    ).map((r) => ({
      status: r.status,
      created_at: r.created_at,
      has_counsellor: !!r.assigned_to,
      next_follow_up_at: r.next_follow_up_at,
      last_contacted_at: r.last_contacted_at,
    })),
    steps: {
      discovery: names.has("discovery_completed"),
      project: names.has("generation_succeeded") || projectRows.length > 0,
      demo: names.has("demo_interacted"),
      brief: names.has("parent_brief_generated"),
      brief_shared: names.has("parent_brief_shared"),
      counsellor: names.has("counsellor_requested") || (requests.data ?? []).length > 0,
      application: names.has("cta:start_application"),
    },
    active_seconds: ((beats.data ?? []) as { active_seconds: number }[]).reduce(
      (sum, b) => sum + b.active_seconds,
      0,
    ),
  };
}
