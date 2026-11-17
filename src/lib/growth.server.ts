// Server-side only: writes growth events through the database function that
// applies first-touch attribution, dedupe, self-referral and spam guards.
type ServerEvent =
  | "landing_visit"
  | "discovery_started"
  | "discovery_completed"
  | "generation_succeeded"
  | "generation_failed"
  | "project_viewed"
  | "project_shared"
  | "referral_visit"
  | "cta_clicked"
  | "parent_brief_generated"
  | "parent_brief_failed"
  | "parent_brief_shared"
  | "parent_brief_opened"
  | "parent_question_asked"
  | "counsellor_requested";

export type GrowthEventInput = {
  event: ServerEvent;
  visitorHash: string;
  projectId?: string | null | undefined;
  briefId?: string | null | undefined;
  ref?: string | null | undefined;
  channel?: string | null | undefined;
  utm_source?: string | null | undefined;
  utm_medium?: string | null | undefined;
  utm_campaign?: string | null | undefined;
  interest?: string | null | undefined;
  technology?: string | null | undefined;
  language?: string | null | undefined;
  class_status?: string | null | undefined;
  failure_kind?: string | null | undefined;
  cta?: string | null | undefined;
  entry_page?: string | null | undefined;
};

/** Returns ok | duplicate | ignored | rate_limited | error. */
export async function recordGrowthEvent(input: GrowthEventInput): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const args = compact({
    _event: input.event,
    _visitor_hash: input.visitorHash,
    _generated_project_id: input.projectId ?? undefined,
    _parent_brief_id: input.briefId ?? undefined,
    _referral_code: input.ref ?? undefined,
    _channel: input.channel ?? undefined,
    _utm_source: input.utm_source ?? undefined,
    _utm_medium: input.utm_medium ?? undefined,
    _utm_campaign: input.utm_campaign ?? undefined,
    _interest: input.interest ?? undefined,
    _technology: input.technology ?? undefined,
    _language: input.language ?? undefined,
    _class_status: input.class_status ?? undefined,
    _failure_kind: input.failure_kind ?? undefined,
    _cta: input.cta ?? undefined,
    _entry_page: input.entry_page ?? undefined,
  });
  const { data, error } = await supabaseAdmin.rpc(
    "record_growth_event",
    args as { _event: string; _visitor_hash: string },
  );
  if (error) {
    console.error(
      JSON.stringify({
        msg: "growth_event_write_failed",
        event: input.event,
        error: error.message,
      }),
    );
    return "error";
  }
  return String(data);
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export function newReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789ABCDEFGH";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % 64]).join("");
}

/** Drops undefined values so optional database arguments are simply omitted. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
