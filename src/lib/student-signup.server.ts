// Server-only free student sign-up and invite-visit recording.
// Sign-up creates the account with the service client (public sign-up stays off
// for everyone else), grants ONLY the student role, links the browser's earlier
// anonymous activity, and turns the consented sign-up into a counsellor lead.
import type { SupabaseClient } from "@supabase/supabase-js";

import { deliverCounsellorWebhook } from "@/lib/counsellor-request.server";
import { isSameOrigin, recordGrowthEvent } from "@/lib/growth.server";
import { inviteVisitSchema, studentSignupSchema } from "@/lib/student-signup";
import { readVisitor, resolveVisitor } from "@/lib/visitor-session.server";

const MAX_BODY = 32 * 1024;
const SIGNUPS_PER_VISITOR_PER_HOUR = 3;

function json(body: object, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

export function newInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function handleStudentSignup(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return json({ ok: false, message: "Invalid request origin." }, 403);
  if (!(request.headers.get("content-type") ?? "").includes("application/json"))
    return json({ ok: false, message: "JSON is required." }, 415);
  const raw = await readJson(request);
  if (raw === undefined) return json({ ok: false, message: "Request too large." }, 413);
  const parsed = studentSignupSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];
    return json(
      {
        ok: false,
        fields,
        message: fields.includes("consent")
          ? "Please tick the consent box to create your account."
          : "Check the highlighted details and try again.",
      },
      400,
    );
  }
  const input = parsed.data;
  const visitor = await resolveVisitor(request);
  const response = await createStudent(input, visitor.hash);
  if (visitor.setCookie) response.headers.append("set-cookie", visitor.setCookie);
  return response;
}

async function createStudent(
  input: ReturnType<typeof studentSignupSchema.parse>,
  visitorHash: string,
): Promise<Response> {
  const db = await admin();

  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count: recent, error: limitError } = await db
    .from("student_activity")
    .select("id", { count: "exact", head: true })
    .eq("visitor_hash", visitorHash)
    .eq("kind", "signup")
    .gte("created_at", since);
  if (limitError) {
    const missing = limitError.code === "PGRST205" || limitError.code === "42P01";
    return json(
      {
        ok: false,
        message: missing
          ? "Free accounts aren't switched on yet. Please try again later."
          : "Please try again shortly.",
      },
      503,
    );
  }
  if ((recent ?? 0) >= SIGNUPS_PER_VISITOR_PER_HOUR)
    return json({ ok: false, message: "Too many accounts from this browser. Try later." }, 429);

  const created = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name },
  });
  if (created.error || !created.data.user) {
    const exists = /already|registered|exists/i.test(created.error?.message ?? "");
    return json(
      {
        ok: false,
        code: exists ? "exists" : "error",
        message: exists
          ? "An account with this email already exists. Please sign in."
          : "Your account couldn't be created. Please try again.",
      },
      exists ? 409 : 503,
    );
  }
  const userId = created.data.user.id;

  try {
    const { error: roleError } = await db
      .from("user_roles")
      .insert({ user_id: userId, role: "student" });
    if (roleError) throw new Error(roleError.message);

    // Link this browser's earlier activity unless another account already owns it.
    const { data: owner } = await db
      .from("student_accounts")
      .select("user_id")
      .eq("visitor_hash", visitorHash)
      .maybeSingle();
    const linkedHash = owner ? null : visitorHash;

    let invitedBy: string | null = null;
    if (input.invite) {
      const { data: inviter } = await db
        .from("student_accounts")
        .select("user_id")
        .eq("invite_code", input.invite.code)
        .maybeSingle();
      invitedBy = (inviter as { user_id?: string } | null)?.user_id ?? null;
    }

    const { error: accountError } = await db.from("student_accounts").insert({
      user_id: userId,
      visitor_hash: linkedHash,
      full_name: input.full_name,
      phone: input.phone,
      class_status: input.class_status,
      city: input.city || null,
      consent_at: new Date().toISOString(),
      invite_code: newInviteCode(),
      invited_by: invitedBy,
    });
    if (accountError) throw new Error(accountError.message);

    const [{ data: project }, { data: attribution }] = await Promise.all([
      db
        .from("generated_projects")
        .select("id, generated_content")
        .eq("owner_visitor_hash", visitorHash)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("visitor_attribution")
        .select("utm_source, utm_medium, utm_campaign, referral_code")
        .eq("visitor_hash", visitorHash)
        .maybeSingle(),
    ]);
    const projectRow = project as { id: string; generated_content: { title?: unknown } } | null;
    const attr = (attribution ?? {}) as Record<string, string | null>;

    const { data: lead, error: leadError } = await db
      .from("counsellor_requests")
      .insert({
        generated_project_id: projectRow?.id ?? null,
        contact_name: input.full_name,
        phone: input.phone,
        who: "student",
        language: input.language,
        consent: true,
        referral_code: attr["referral_code"] ?? null,
        utm_source: attr["utm_source"] ?? null,
        utm_medium: attr["utm_medium"] ?? null,
        utm_campaign: attr["utm_campaign"] ?? null,
        visitor_hash: visitorHash,
        status: "new",
        lead_source: "student_signup",
        student_user_id: userId,
      })
      .select("id")
      .single();
    if (leadError || !lead) throw new Error(leadError?.message ?? "lead");

    // Pre-sign-up journey from this browser, then the sign-up itself.
    const floor = Date.now() - 30 * 86_400_000;
    const rows = [
      ...input.journey.map((entry) => ({
        user_id: userId,
        visitor_hash: visitorHash,
        kind: "page_view",
        path: entry.path,
        seconds: entry.seconds,
        created_at: new Date(
          Math.min(Date.now(), Math.max(floor, Date.parse(entry.at))),
        ).toISOString(),
      })),
      ...Array.from({ length: input.prompts }, () => ({
        user_id: userId,
        visitor_hash: visitorHash,
        kind: "signup_prompt_shown",
      })),
      { user_id: userId, visitor_hash: visitorHash, kind: "signup" },
      { user_id: userId, visitor_hash: visitorHash, kind: "login" },
      ...(invitedBy
        ? [{ user_id: invitedBy, kind: "invite_signup", detail: input.invite!.kind }]
        : []),
    ];
    const { error: activityError } = await db.from("student_activity").insert(rows);
    if (activityError) throw new Error(activityError.message);

    await recordGrowthEvent({
      event: "counsellor_requested",
      visitorHash,
      projectId: projectRow?.id ?? null,
      language: input.language,
    });
    const webhook = process.env["COUNSELLOR_WEBHOOK_URL"];
    if (webhook) {
      const delivered = await deliverCounsellorWebhook(webhook, {
        request_id: (lead as { id: string }).id,
        name: input.full_name,
        phone: input.phone,
        who: "student",
        language: input.language,
        project_title:
          typeof projectRow?.generated_content?.title === "string"
            ? projectRow.generated_content.title
            : "Signed up before generating a project",
        brief_link: null,
        utm_source: attr["utm_source"] ?? null,
        utm_medium: attr["utm_medium"] ?? null,
        utm_campaign: attr["utm_campaign"] ?? null,
      });
      if (delivered)
        await db
          .from("counsellor_requests")
          .update({ delivered: true, delivered_at: new Date().toISOString() })
          .eq("id", (lead as { id: string }).id);
    }
    return json({ ok: true });
  } catch (error) {
    // Never leave a half-created account behind.
    console.error(
      JSON.stringify({
        msg: "student_signup_failed",
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
    await db.auth.admin.deleteUser(userId).catch(() => undefined);
    return json({ ok: false, message: "Your account couldn't be created. Please try again." }, 503);
  }
}

export async function handleInviteVisit(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return json({ ok: false }, 403);
  const parsed = inviteVisitSchema.safeParse(await readJson(request));
  if (!parsed.success) return json({ ok: false }, 400);
  const visitor = await resolveVisitor(request);
  const db = await admin();
  const { data: owner } = await db
    .from("student_accounts")
    .select("user_id, visitor_hash")
    .eq("invite_code", parsed.data.code)
    .maybeSingle();
  const inviter = owner as { user_id: string; visitor_hash: string | null } | null;
  let result = "ignored";
  if (inviter && inviter.visitor_hash !== visitor.hash) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await db
      .from("student_activity")
      .select("id", { count: "exact", head: true })
      .eq("user_id", inviter.user_id)
      .eq("visitor_hash", visitor.hash)
      .eq("kind", "invite_visit")
      .gte("created_at", since);
    if (!count) {
      const { error } = await db.from("student_activity").insert({
        user_id: inviter.user_id,
        visitor_hash: visitor.hash,
        kind: "invite_visit",
        detail: parsed.data.kind,
      });
      result = error ? "error" : "ok";
    } else result = "duplicate";
  }
  const response = json({ ok: true, result });
  if (visitor.setCookie) response.headers.append("set-cookie", visitor.setCookie);
  return response;
}

/** Signed-in student activity (page views, logins, logouts, return visits, invites). */
export async function runRecordStudentActivity(
  context: { supabase: unknown; userId: string },
  events: {
    kind: string;
    path?: string | undefined;
    seconds?: number | undefined;
    detail?: string | undefined;
    at?: string | undefined;
  }[],
) {
  const roles = context.supabase as {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "student" },
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const { data: isStudent } = await roles.rpc("has_role", {
    _user_id: context.userId,
    _role: "student",
  });
  if (isStudent !== true) return { ok: false as const };
  const db = await admin();
  const { data: account } = await db
    .from("student_accounts")
    .select("visitor_hash")
    .eq("user_id", context.userId)
    .maybeSingle();
  const hash = (account as { visitor_hash: string | null } | null)?.visitor_hash ?? null;
  const floor = Date.now() - 86_400_000;
  const { error } = await db.from("student_activity").insert(
    events.map((event) => ({
      user_id: context.userId,
      visitor_hash: hash,
      kind: event.kind,
      path: event.path ?? null,
      seconds: event.seconds ?? null,
      detail: event.detail ?? null,
      created_at: new Date(
        event.at ? Math.min(Date.now(), Math.max(floor, Date.parse(event.at))) : Date.now(),
      ).toISOString(),
    })),
  );
  return { ok: !error };
}
