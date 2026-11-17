import { isSameOrigin, recordGrowthEvent } from "@/lib/growth.server";
import { counsellorRequestSchema } from "@/lib/parent-experience";
import { resolveVisitor } from "@/lib/visitor-session.server";

function json(body: object, status = 200): Response {
  return Response.json(body, { status, headers: { "content-type": "application/json" } });
}

type WebhookPayload = {
  request_id: string;
  name: string;
  phone: string;
  who: "student" | "parent";
  language: string;
  project_title: string;
  brief_link: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

/** Delivers already-consented contact details to the configured private endpoint. */
export async function deliverCounsellorWebhook(
  url: string,
  payload: WebhookPayload,
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function handleCounsellorRequest(request: Request): Promise<Response> {
  const visitor = await resolveVisitor(request);
  const response = await createCounsellorRequest(request, visitor.hash);
  if (visitor.setCookie) response.headers.append("set-cookie", visitor.setCookie);
  return response;
}

async function createCounsellorRequest(request: Request, visitorHash: string): Promise<Response> {
  if (!isSameOrigin(request)) return json({ ok: false, message: "Invalid request origin." }, 403);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return json({ ok: false, message: "JSON is required." }, 415);
  }
  const parsed = counsellorRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((issue) => issue.path[0] === "consent");
    return json(
      {
        ok: false,
        message: consentMissing
          ? "Please give consent before requesting a call."
          : "Check your name, mobile number and selections.",
      },
      400,
    );
  }
  const input = parsed.data;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: project, error: projectError } = await supabaseAdmin
    .from("generated_projects")
    .select("id, interest, technology, class_status, generated_content")
    .eq("id", input.generated_project_id)
    .maybeSingle();
  if (projectError || !project) return json({ ok: false, message: "Project not found." }, 404);

  if (input.parent_brief_id) {
    const { data: brief } = await supabaseAdmin
      .from("parent_briefs")
      .select("id")
      .eq("id", input.parent_brief_id)
      .eq("generated_project_id", project.id)
      .maybeSingle();
    if (!brief)
      return json({ ok: false, message: "The parent brief does not match this project." }, 400);
  }

  const { data: attribution } = await supabaseAdmin
    .from("visitor_attribution")
    .select("referral_code, utm_source, utm_medium, utm_campaign")
    .eq("visitor_hash", visitorHash)
    .maybeSingle();

  const { data: saved, error: saveError } = await supabaseAdmin
    .from("counsellor_requests")
    .insert({
      parent_brief_id: input.parent_brief_id ?? null,
      generated_project_id: project.id,
      contact_name: input.contact_name,
      phone: input.phone,
      who: input.who,
      language: input.language,
      consent: input.consent,
      referral_code: attribution?.referral_code ?? null,
      utm_source: attribution?.utm_source ?? null,
      utm_medium: attribution?.utm_medium ?? null,
      utm_campaign: attribution?.utm_campaign ?? null,
    })
    .select("id")
    .single();
  if (saveError || !saved) {
    console.error("Counsellor request could not be saved", saveError?.message);
    return json({ ok: false, message: "We couldn't save your request. Please try again." }, 500);
  }

  const title = (project.generated_content as { title?: unknown }).title;
  const briefLink = input.parent_brief_id
    ? `${new URL(request.url).origin}/parent?id=${input.parent_brief_id}`
    : null;
  const webhookUrl = process.env["COUNSELLOR_WEBHOOK_URL"]?.trim();
  const delivered = webhookUrl
    ? await deliverCounsellorWebhook(webhookUrl, {
        request_id: saved.id,
        name: input.contact_name,
        phone: input.phone,
        who: input.who,
        language: input.language,
        project_title: typeof title === "string" ? title : "FutureMe AI project",
        brief_link: briefLink,
        utm_source: attribution?.utm_source ?? null,
        utm_medium: attribution?.utm_medium ?? null,
        utm_campaign: attribution?.utm_campaign ?? null,
      })
    : false;
  if (!delivered) {
    console.error(
      JSON.stringify({
        msg: "counsellor_webhook_not_delivered",
        request_id: saved.id,
        reason: webhookUrl ? "webhook_failed" : "webhook_not_configured",
      }),
    );
  }

  await recordGrowthEvent({
    event: "counsellor_requested",
    visitorHash,
    projectId: project.id,
    briefId: input.parent_brief_id ?? null,
    interest: project.interest,
    technology: project.technology,
    language: input.language,
    class_status: project.class_status,
    failure_kind: delivered ? null : webhookUrl ? "webhook_failed" : "webhook_not_configured",
  });

  return json({
    ok: true,
    request_id: saved.id,
    message:
      "Your counsellor call request is saved. A NIAT counsellor can contact you using the details you provided.",
  });
}
