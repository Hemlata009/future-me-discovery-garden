// Server-only read/save/delete of a student's own pre-application details.
// Rows are keyed by the hashed, server-issued HttpOnly visitor cookie, so a
// browser can only ever reach its own row. The table is service-role only.
// Contact details are never written to growth events or analytics.
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  applicationProfileFieldsSchema,
  saveApplicationProfileSchema,
  type SavedApplicationProfile,
} from "@/lib/application-profile";
import { isSameOrigin } from "@/lib/growth.server";
import { readVisitor, resolveVisitor } from "@/lib/visitor-session.server";

export const APPLICATION_PROFILE_TABLE = "pre_application_profiles";
const COLUMNS =
  "student_name, student_phone, email, city, state, qualification, passing_year, intended_course, updated_at";

function json(body: object, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** The table is added by docs/pre-application-profile.md and is not in the generated types yet. */
async function profileTable() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as SupabaseClient;
  // Returned inside an object: query builders are thenable, so an async
  // function must not return one directly or it would be executed early.
  return { query: () => db.from(APPLICATION_PROFILE_TABLE) };
}

/** PostgREST/Postgres codes for a table that has not been created yet. */
export function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

const NOT_READY = {
  ok: false,
  code: "not-ready",
  message: "Saving application details isn't switched on yet. Please try again later.",
};

type ProfileRow = {
  student_name?: unknown;
  student_phone?: unknown;
  email?: unknown;
  city?: unknown;
  state?: unknown;
  qualification?: unknown;
  passing_year?: unknown;
  intended_course?: unknown;
  updated_at?: unknown;
};

function toSaved(row: ProfileRow): SavedApplicationProfile | null {
  const parsed = applicationProfileFieldsSchema.safeParse({
    student_name: row.student_name,
    student_phone: row.student_phone,
    email: row.email ?? "",
    city: row.city,
    state: row.state,
    qualification: row.qualification,
    passing_year: row.passing_year ?? "",
    intended_course: row.intended_course,
  });
  if (!parsed.success || typeof row.updated_at !== "string") return null;
  return { ...parsed.data, updated_at: row.updated_at };
}

export async function handleApplicationProfile(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return json({ ok: false, message: "Invalid request origin." }, 403);

  if (request.method === "GET" || request.method === "DELETE") {
    const visitorHash = await readVisitor(request);
    if (!visitorHash) return json({ ok: true, profile: null });
    const table = await profileTable();
    if (request.method === "DELETE") {
      const { error } = await table.query().delete().eq("visitor_hash", visitorHash);
      if (isMissingTable(error)) return json(NOT_READY, 503);
      if (error) return json({ ok: false, message: "Please try again shortly." }, 503);
      return json({ ok: true, profile: null });
    }
    const { data, error } = await table
      .query()
      .select(COLUMNS)
      .eq("visitor_hash", visitorHash)
      .maybeSingle();
    if (isMissingTable(error)) return json(NOT_READY, 503);
    if (error) return json({ ok: false, message: "Please try again shortly." }, 503);
    return json({ ok: true, profile: data ? toSaved(data) : null });
  }

  if (request.method !== "PUT") return json({ ok: false, message: "Method not allowed." }, 405);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return json({ ok: false, message: "JSON is required." }, 415);
  }
  const body = await request.text();
  if (body.length > 4096) return json({ ok: false, message: "Request too large." }, 413);
  let raw: unknown = null;
  try {
    raw = JSON.parse(body);
  } catch {
    raw = null;
  }
  const parsed = saveApplicationProfileSchema.safeParse(raw);
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((issue) => issue.path[0] === "consent");
    return json(
      {
        ok: false,
        message: consentMissing
          ? "Please tick the consent box before saving."
          : "Check the highlighted details and try again.",
        fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))],
      },
      400,
    );
  }

  const visitor = await resolveVisitor(request);
  const { consent: _consent, generated_project_id, ...fields } = parsed.data;
  const now = new Date().toISOString();
  const table = await profileTable();
  const { data, error } = await table
    .query()
    .upsert(
      {
        visitor_hash: visitor.hash,
        generated_project_id: generated_project_id ?? null,
        ...fields,
        email: fields.email || null,
        passing_year: fields.passing_year || null,
        consent_at: now,
        updated_at: now,
      },
      { onConflict: "visitor_hash" },
    )
    .select(COLUMNS)
    .single();

  let response: Response;
  if (isMissingTable(error)) response = json(NOT_READY, 503);
  else if (error || !data) {
    console.error("Application profile save failed", error?.code ?? "no-row");
    response = json({ ok: false, message: "Your details couldn't be saved. Try again." }, 503);
  } else response = json({ ok: true, profile: toSaved(data) });
  if (visitor.setCookie) response.headers.append("set-cookie", visitor.setCookie);
  return response;
}
