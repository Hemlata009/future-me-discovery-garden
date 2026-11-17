import { isSameOrigin, recordGrowthEvent } from "@/lib/growth.server";
import { counsellorRequestSchema } from "@/lib/parent-experience";
import {
  counsellorLimitMessage,
  readCounsellorLimits,
  type CounsellorLimitReason,
} from "@/lib/rate-limit-config";
import { resolveVisitor } from "@/lib/visitor-session.server";

function json(body: object, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
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

const REQUEST_SAVED_MESSAGE =
  "Your counsellor call request is saved. A NIAT counsellor can contact you using the details you provided.";
const DUPLICATE_MESSAGE =
  "We've already received your counsellor call request for this project. A NIAT counsellor can contact you using the details you provided.";

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
    if (!brief) {
      return json({ ok: false, message: "The parent brief does not match this project." }, 400);
    }
  }

  const limits = readCounsellorLimits(process.env);
  const { data: slot, error: slotError } = await supabaseAdmin.rpc(
    "claim_counsellor_request_slot",
    {
      _visitor_hash: visitorHash,
      _generated_project_id: project.id,
      _phone: input.phone,
      _visitor_limit: limits.visitorLimit,
      _visitor_window_seconds: limits.visitorWindowSeconds,
      _global_per_day: limits.globalPerDay,
    },
  );
  if (slotError || !slot) {
    console.error("Counsellor request limit check failed");
    return json({ ok: false, message: "We couldn't check your request. Please try again." }, 503);
  }
  const claim = slot as {
    allowed: boolean;
    duplicate?: boolean;
    reason?: CounsellorLimitReason;
    retry_after_seconds?: number;
    attempt_id?: string;
    request_id?: string;
  };

  if (claim.duplicate && claim.request_id) {
    return json({
      ok: true,
      duplicate: true,
      request_id: claim.request_id,
      message: DUPLICATE_MESSAGE,
    });
  }

  if (!claim.allowed) {
    const reason = claim.reason === "visitor" ? "visitor" : "global";
    const retry = Math.max(1, claim.retry_after_seconds ?? 3600);
    await recordGrowthEvent({
      event: "counsellor_requested",
      visitorHash,
      projectId: project.id,
      briefId: input.parent_brief_id ?? null,
      interest: project.interest,
      technology: project.technology,
      language: input.language,
      class_status: project.class_status,
      failure_kind: reason === "visitor" ? "visitor_limit" : "global_limit",
    });
    return json(
      {
        ok: false,
        code: "rate-limit",
        message: counsellorLimitMessage(reason, retry),
        retry_after_seconds: retry,
      },
      429,
      { "retry-after": String(retry) },
    );
  }

  // Only successfully saved requests consume a slot.
  const releaseSlot = async () => {
    if (!claim.attempt_id) return;
    await supabaseAdmin.from("counsellor_request_attempts").delete().eq("id", claim.attempt_id);
  };

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
    await releaseSlot();
    console.error("Counsellor request could not be saved");
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

  if (delivered) {
    const { error: deliveryError } = await supabaseAdmin
      .from("counsellor_requests")
      .update({ delivered: true, delivered_at: new Date().toISOString() })
      .eq("id", saved.id);
    if (deliveryError) {
      console.error(
        JSON.stringify({ msg: "counsellor_delivery_update_failed", request_id: saved.id }),
      );
    }
  } else {
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

  return json({ ok: true, request_id: saved.id, message: REQUEST_SAVED_MESSAGE });
}
