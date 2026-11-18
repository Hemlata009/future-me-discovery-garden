import { engagementPayloadSchema } from "@/lib/engagement";
import { isSameOrigin } from "@/lib/growth.server";
import { readVisitor } from "@/lib/visitor-session.server";

const MAX_BODY_BYTES = 512;

/** Server-calculated heartbeat: the client cannot submit an active-time increment. */
export async function handleEngagement(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return Response.json({ result: "ignored" }, { status: 403 });
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return Response.json({ result: "invalid" }, { status: 415 });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return Response.json({ result: "invalid" }, { status: 413 });
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return Response.json({ result: "invalid" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const parsed = engagementPayloadSchema.safeParse(body);
  if (!parsed.success) return Response.json({ result: "invalid" }, { status: 400 });

  const visitorHash = await readVisitor(request);
  if (!visitorHash) return Response.json({ result: "no_visitor" }, { status: 401 });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("record_engagement_heartbeat", {
    _session_id: parsed.data.session_id,
    _visitor_hash: visitorHash,
    ...(parsed.data.generated_project_id
      ? { _generated_project_id: parsed.data.generated_project_id }
      : {}),
  });
  if (error || !data) {
    console.error(JSON.stringify({ msg: "engagement_heartbeat_failed" }));
    return Response.json({ result: "unavailable" }, { status: 503 });
  }
  const result = data as { result?: string };
  const status = result.result === "rate_limited" ? 429 : 200;
  return Response.json(result, {
    status,
    headers: {
      "cache-control": "no-store",
      ...(status === 429 ? { "retry-after": "15" } : {}),
    },
  });
}
