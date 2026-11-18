// Server-only lead reads and mutations. Every entry point verifies a current
// admin/counsellor role before touching any identified or activity record.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  buildCounsellorReport,
  buildLeadView,
  type CounsellorAssignee,
  type CounsellorLeadResult,
  type CounsellorRole,
  type CounsellorWorkspaceResult,
  type Heartbeat,
  type LeadEvent,
  type LeadSource,
  type LeadStatus,
  type ReferralOwner,
} from "@/lib/counsellor-metrics";
import type { updateLeadSchema } from "@/lib/counsellor-workspace.functions";
import type { z } from "zod";

type Db = SupabaseClient<Database>;
type Context = { supabase: unknown; userId: string };
type Role = CounsellorRole;
type Assignee = CounsellorAssignee;
type WorkspaceResult = CounsellorWorkspaceResult;
type LeadResult = CounsellorLeadResult;
type RequestRow = Database["public"]["Tables"]["counsellor_requests"]["Row"];
type ProjectRow = Pick<
  Database["public"]["Tables"]["generated_projects"]["Row"],
  "id" | "interest" | "technology" | "class_status" | "generated_content"
>;
type ReadError = { message: string } | null;

export async function authorizeCounsellor(context: Context): Promise<Role | null> {
  const db = context.supabase as Db;
  const { data: admin, error: adminError } = await db.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (adminError) return null;
  if (admin === true) return "admin";
  const { data: counsellor, error } = await db.rpc("has_role", {
    _user_id: context.userId,
    _role: "counsellor",
  });
  return !error && counsellor === true ? "counsellor" : null;
}

async function readPages<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: ReadError }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

function chunks<T>(values: T[], size = 50): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}

function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

async function readRequests(
  context: Context,
  role: Role,
  range?: { from: string; to: string },
  id?: string,
) {
  const db = context.supabase as Db;
  return readPages<RequestRow>((from, to) => {
    let query = db
      .from("counsellor_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (role === "counsellor") query = query.eq("assigned_to", context.userId);
    if (id) query = query.eq("id", id);
    if (range) {
      query = query
        .gte("created_at", `${range.from}T00:00:00.000Z`)
        .lt("created_at", `${nextDay(range.to)}T00:00:00.000Z`);
    }
    return query.range(from, to);
  });
}

async function leadSources(db: Db, requests: RequestRow[]): Promise<LeadSource[]> {
  const projects: ProjectRow[] = [];
  for (const ids of chunks([...new Set(requests.map((row) => row.generated_project_id))])) {
    projects.push(
      ...(await readPages<ProjectRow>((from, to) =>
        db
          .from("generated_projects")
          .select("id, interest, technology, class_status, generated_content")
          .in("id", ids)
          .range(from, to),
      )),
    );
  }
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  return requests.map((request) => {
    const project = projectMap.get(request.generated_project_id);
    if (!project) throw new Error("A lead's project could not be read.");
    const content = project.generated_content as { title?: unknown };
    return {
      id: request.id,
      contact_name: request.contact_name,
      phone: request.phone,
      visitor_hash: request.visitor_hash ?? null,
      generated_project_id: request.generated_project_id,
      parent_brief_id: request.parent_brief_id,
      language: request.language,
      who: request.who,
      interest: project.interest,
      technology: project.technology,
      class_status: project.class_status,
      project_title: typeof content.title === "string" ? content.title : "FutureMe Family project",
      referral_code: request.referral_code,
      utm_source: request.utm_source,
      utm_medium: request.utm_medium,
      utm_campaign: request.utm_campaign,
      status: request.status as LeadStatus,
      assigned_to: request.assigned_to,
      next_follow_up_at: request.next_follow_up_at,
      last_contacted_at: request.last_contacted_at,
      call_outcome: request.call_outcome,
      internal_notes: request.internal_notes,
      delivered: request.delivered,
      created_at: request.created_at,
      updated_at: request.updated_at,
    };
  });
}

async function relatedData(db: Db, sources: LeadSource[], range?: { from: string; to: string }) {
  const visitors = [
    ...new Set(
      sources.map((lead) => lead.visitor_hash).filter((value): value is string => value !== null),
    ),
  ];
  const projects = [...new Set(sources.map((lead) => lead.generated_project_id))];
  const events: LeadEvent[] = [];
  const groups = chunks(
    [
      ...visitors.map((visitor) => `visitor_hash.eq.${visitor}`),
      ...projects.map((project) => `generated_project_id.eq.${project}`),
    ],
    40,
  );
  for (const group of groups) {
    events.push(
      ...(await readPages<LeadEvent>((from, to) => {
        let query = db
          .from("growth_events")
          .select(
            "id, event_name, visitor_hash, generated_project_id, parent_brief_id, referral_code, channel, cta, failure_kind, created_at",
          )
          .or(group.join(","))
          .order("created_at", { ascending: false });
        if (range)
          query = query
            .gte("created_at", `${range.from}T00:00:00.000Z`)
            .lt("created_at", `${nextDay(range.to)}T00:00:00.000Z`);
        return query.range(from, to);
      })),
    );
  }
  // Overlapping visitor/project groups can return the same row twice.
  const uniqueEvents = [...new Map(events.map((event) => [event.id, event])).values()];
  const heartbeats: Heartbeat[] = [];
  for (const hashes of chunks(visitors)) {
    heartbeats.push(
      ...(await readPages<Heartbeat>((from, to) => {
        let query = db
          .from("engagement_heartbeats")
          .select("visitor_hash, active_seconds, created_at")
          .in("visitor_hash", hashes);
        if (range)
          query = query
            .gte("created_at", `${range.from}T00:00:00.000Z`)
            .lt("created_at", `${nextDay(range.to)}T00:00:00.000Z`);
        return query.range(from, to);
      })),
    );
  }
  const referralOwners: ReferralOwner[] = [];
  for (const hashes of chunks(visitors)) {
    referralOwners.push(
      ...(await readPages<ReferralOwner>((from, to) =>
        db
          .from("referral_links")
          .select("code, owner_visitor_hash")
          .in("owner_visitor_hash", hashes)
          .range(from, to),
      )),
    );
  }
  return { events: uniqueEvents, heartbeats, referralOwners };
}

export async function runCounsellorWorkspace(
  context: Context,
  range: { from: string; to: string },
): Promise<WorkspaceResult> {
  const role = await authorizeCounsellor(context);
  if (!role) return { access: "denied" as const };
  try {
    const requests = await readRequests(context, role, range);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sources = await leadSources(supabaseAdmin, requests);
    const related = await relatedData(supabaseAdmin, sources, range);
    const leads = sources.map((lead) =>
      buildLeadView(lead, related.events, related.heartbeats, related.referralOwners, range.to),
    );
    const assignees =
      role === "admin"
        ? await readPages<Assignee>((from, to) =>
            supabaseAdmin
              .from("user_roles")
              .select("user_id, role")
              .in("role", ["admin", "counsellor"])
              .range(from, to),
          )
        : [];
    return {
      access: "ok" as const,
      role,
      leads,
      assignees,
      report: buildCounsellorReport(leads, related.events, related.heartbeats, range),
    };
  } catch (error) {
    console.error(
      JSON.stringify({
        msg: "counsellor_workspace_failed",
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    throw new Error("The counsellor workspace couldn't be loaded. Please try again.");
  }
}

export async function runCounsellorLead(context: Context, id: string): Promise<LeadResult> {
  const role = await authorizeCounsellor(context);
  if (!role) return { access: "denied" as const };
  const requests = await readRequests(context, role, undefined, id);
  if (requests.length !== 1) return { access: "not_found" as const };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const sources = await leadSources(supabaseAdmin, requests);
  const related = await relatedData(supabaseAdmin, sources);
  const today = new Date().toISOString().slice(0, 10);
  const lead = buildLeadView(
    sources[0]!,
    related.events,
    related.heartbeats,
    related.referralOwners,
    today,
  );
  const assignees =
    role === "admin"
      ? await readPages<Assignee>((from, to) =>
          supabaseAdmin
            .from("user_roles")
            .select("user_id, role")
            .in("role", ["admin", "counsellor"])
            .range(from, to),
        )
      : [];
  const timeline = related.events
    .filter(
      (event) =>
        event.visitor_hash === lead.visitor_hash ||
        event.generated_project_id === lead.generated_project_id,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((event) => ({
      id: event.id,
      event_name: event.event_name,
      cta: event.cta,
      channel: event.channel,
      created_at: event.created_at,
      source:
        event.visitor_hash === lead.visitor_hash
          ? "Identified visitor"
          : "Related project activity",
    }));
  return { access: "ok" as const, role, lead, timeline, assignees };
}

export async function runRevealCounsellorPhone(context: Context, id: string) {
  const role = await authorizeCounsellor(context);
  if (!role) return { access: "denied" as const };
  const db = context.supabase as Db;
  let query = db.from("counsellor_requests").select("phone").eq("id", id);
  if (role === "counsellor") query = query.eq("assigned_to", context.userId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) return { access: "not_found" as const };
  return { access: "ok" as const, phone: data.phone };
}

export async function runUpdateCounsellorLead(
  context: Context,
  input: z.infer<typeof updateLeadSchema>,
) {
  const role = await authorizeCounsellor(context);
  if (!role) return { access: "denied" as const };
  if (role !== "admin" && input.assigned_to !== undefined) return { access: "denied" as const };
  const db = context.supabase as Db;
  let existingQuery = db
    .from("counsellor_requests")
    .select("id, status, assigned_to")
    .eq("id", input.id);
  if (role === "counsellor") existingQuery = existingQuery.eq("assigned_to", context.userId);
  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError || !existing) return { access: "not_found" as const };

  if (input.assigned_to) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: assignee } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", input.assigned_to)
      .in("role", ["admin", "counsellor"])
      .limit(1)
      .maybeSingle();
    if (!assignee) return { access: "invalid_assignee" as const };
  }

  const patch: Database["public"]["Tables"]["counsellor_requests"]["Update"] = {
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.assigned_to !== undefined ? { assigned_to: input.assigned_to } : {}),
    ...(input.next_follow_up_at !== undefined
      ? { next_follow_up_at: input.next_follow_up_at }
      : {}),
    ...(input.last_contacted_at !== undefined
      ? { last_contacted_at: input.last_contacted_at }
      : {}),
    ...(input.call_outcome !== undefined ? { call_outcome: input.call_outcome } : {}),
    ...(input.internal_notes !== undefined ? { internal_notes: input.internal_notes } : {}),
  };
  if (
    role === "admin" &&
    input.assigned_to &&
    existing.status === "new" &&
    input.status === undefined
  ) {
    patch.status = "assigned";
  }
  if (input.call_outcome && input.last_contacted_at === undefined) {
    patch.last_contacted_at = new Date().toISOString();
  }
  const { data: updated, error } = await db
    .from("counsellor_requests")
    .update(patch)
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error || !updated) return { access: "not_found" as const };
  return { access: "ok" as const };
}
