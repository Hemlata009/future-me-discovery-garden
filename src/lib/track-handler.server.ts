// Server-side only: validates a browser growth event and reports honestly
// whether it was stored.
import { trackPayloadSchema } from "@/lib/tracking";
import { isSameOrigin, recordGrowthEvent } from "@/lib/growth.server";
import { readVisitor } from "@/lib/visitor-session.server";

const MAX_BODY_BYTES = 2048;

/** Maps a database result to the HTTP status the browser sees. */
export function trackStatus(result: string): number {
  if (result === "ok" || result === "duplicate" || result === "ignored") return 200;
  if (result === "rate_limited") return 429;
  return 503;
}

export async function handleTrack(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 415 });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return Response.json({ ok: false }, { status: 413 });
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return Response.json({ ok: false }, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const parsed = trackPayloadSchema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false, error: "invalid" }, { status: 400 });

  // Only browsers already holding a visitor cookie (from /api/visitor) may record
  // events, so cookie-less scripts can't mint a new "visitor" on every request.
  const visitor = await readVisitor(request);
  if (!visitor) return Response.json({ ok: false, error: "no_visitor" }, { status: 401 });

  const p = parsed.data;
  const result = await recordGrowthEvent({
    event: p.event,
    visitorHash: visitor,
    projectId: p.project_id,
    ref: p.ref,
    channel: p.channel,
    cta: p.cta,
    entry_page: p.entry_page,
    utm_source: p.utm_source,
    utm_medium: p.utm_medium,
    utm_campaign: p.utm_campaign,
  });
  const status = trackStatus(result);
  if (status !== 200) {
    console.error(
      JSON.stringify({ msg: "track_event_not_recorded", event: p.event, result, status }),
    );
  }
  return Response.json(
    {
      ok: status === 200,
      result: status === 200 ? result : status === 429 ? "rate_limited" : "unavailable",
    },
    { status, headers: status === 429 ? { "retry-after": "600" } : {} },
  );
}
