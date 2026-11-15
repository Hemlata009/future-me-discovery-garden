// Browser-safe: the shape of growth events the browser may send, plus the
// small client helper that posts them to /api/track.
import { z } from "zod";

export const BROWSER_EVENTS = [
  "landing_visit",
  "discovery_started",
  "project_viewed",
  "project_shared",
  "referral_visit",
  "cta_clicked",
] as const;
export type BrowserEvent = (typeof BROWSER_EVENTS)[number];

export const CTA_IDS = ["explore_niat", "visit_niat"] as const;

const tag = z
  .string()
  .trim()
  .max(100)
  .regex(/^[\w .:-]+$/)
  .transform((v) => v.toLowerCase());
export const referralCodeSchema = z.string().regex(/^[A-Za-z0-9]{12}$/);

export const trackPayloadSchema = z
  .object({
    event: z.enum(BROWSER_EVENTS),
    project_id: z.string().uuid().optional(),
    ref: referralCodeSchema.optional(),
    channel: z.enum(["copy", "whatsapp"]).optional(),
    cta: z.enum(CTA_IDS).optional(),
    utm_source: tag.optional(),
    utm_medium: tag.optional(),
    utm_campaign: tag.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.event === "project_viewed" || v.event === "project_shared") && !v.project_id) {
      ctx.addIssue({ code: "custom", message: "project_id required" });
    }
    if (v.event === "project_shared" && !v.channel) {
      ctx.addIssue({ code: "custom", message: "channel required" });
    }
    if (v.event === "referral_visit" && !v.ref) {
      ctx.addIssue({ code: "custom", message: "ref required" });
    }
    if (v.event === "cta_clicked" && !v.cta) {
      ctx.addIssue({ code: "custom", message: "cta required" });
    }
  });
export type TrackPayload = z.input<typeof trackPayloadSchema>;

/** Reads utm_* and ref from a URL query string, dropping anything malformed. */
export function attributionFromSearch(search: string): Partial<TrackPayload> {
  const params = new URLSearchParams(search);
  const out: Partial<TrackPayload> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign"] as const) {
    const parsed = tag.safeParse(params.get(key) ?? undefined);
    if (parsed.success && parsed.data) out[key] = parsed.data;
  }
  const ref = referralCodeSchema.safeParse(params.get("ref") ?? undefined);
  if (ref.success) out.ref = ref.data;
  return out;
}

let visitorReady: Promise<void> | null = null;
/**
 * Resolves once this browser holds its anonymous visitor cookie. Every request
 * that needs the visitor waits on this, so parallel first requests can't each
 * be handed a different id.
 */
export function ensureVisitor(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  visitorReady ??= fetch("/api/visitor", { method: "POST", credentials: "same-origin" })
    .then(() => undefined)
    .catch(() => undefined);
  return visitorReady;
}

/** Fire-and-forget; tracking must never break the page. */
export async function track(payload: TrackPayload): Promise<void> {
  if (typeof window === "undefined") return;
  await ensureVisitor();
  const body = { ...attributionFromSearch(window.location.search), ...payload };
  if (body.event !== "referral_visit" && !payload.ref) delete body.ref;
  return fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
    credentials: "same-origin",
  })
    .then(() => undefined)
    .catch(() => undefined);
}

export function referralUrl(origin: string, projectId: string, code: string | null): string {
  const url = new URL("/project", origin);
  url.searchParams.set("id", projectId);
  if (code) url.searchParams.set("ref", code);
  return url.toString();
}
