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
  "parent_brief_shared",
  "parent_brief_opened",
] as const;
export type BrowserEvent = (typeof BROWSER_EVENTS)[number];

// explore_niat = opened the NIAT pop-up; visit_niat = clicked the outbound NIAT link.
export const CTA_IDS = [
  "explore_niat",
  "visit_niat",
  "start_application",
  "talk_to_counsellor",
] as const;

export const ENTRY_PAGES = [
  "home",
  "discover",
  "project",
  "projects",
  "how_it_works",
  "showcase",
  "parent",
  "parent_brief",
  "other",
] as const;
export type EntryPage = (typeof ENTRY_PAGES)[number];

/** Maps a path to a fixed entry-page name; team pages return null and are never counted. */
export function entryPageFor(pathname: string): EntryPage | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin" || path === "/auth" || path.startsWith("/api/")) return null;
  const map: Record<string, EntryPage> = {
    "/": "home",
    "/discover": "discover",
    "/project": "project",
    "/projects": "projects",
    "/how-it-works": "how_it_works",
    "/showcase": "showcase",
    "/parent": "parent",
    "/parent-brief": "parent_brief",
  };
  return map[path] ?? "other";
}

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
    brief_id: z.string().uuid().optional(),
    ref: referralCodeSchema.optional(),
    channel: z.enum(["copy", "whatsapp"]).optional(),
    cta: z.enum(CTA_IDS).optional(),
    entry_page: z.enum(ENTRY_PAGES).optional(),
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
    if ((v.event === "parent_brief_opened" || v.event === "parent_brief_shared") && !v.brief_id) {
      ctx.addIssue({ code: "custom", message: "brief_id required" });
    }
    if (v.event === "parent_brief_shared" && !v.channel) {
      ctx.addIssue({ code: "custom", message: "channel required" });
    }
    if (v.event === "referral_visit" && !v.ref) {
      ctx.addIssue({ code: "custom", message: "ref required" });
    }
    if (v.event === "landing_visit" && !v.entry_page) {
      ctx.addIssue({ code: "custom", message: "entry_page required" });
    }
    if (v.event !== "landing_visit" && v.entry_page) {
      ctx.addIssue({ code: "custom", message: "entry_page only on landing_visit" });
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

/**
 * Builds the body sent to /api/track. The referral code from the URL rides
 * along on the entry visit and the referral visit so first-touch attribution
 * keeps it whichever arrives first; other events never carry it.
 */
export function buildTrackBody(payload: TrackPayload, search: string): TrackPayload {
  const body = { ...attributionFromSearch(search), ...payload };
  const keepsRef = body.event === "referral_visit" || body.event === "landing_visit";
  if (!keepsRef && !payload.ref) delete body.ref;
  return body;
}

/**
 * Fire-and-forget; tracking must never break the page. Resolves true only when
 * the server confirms the event was recorded (or recognised as a duplicate).
 */
export async function track(payload: TrackPayload): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    await ensureVisitor();
    const res = await fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildTrackBody(payload, window.location.search)),
      keepalive: true,
      credentials: "same-origin",
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return data?.ok === true;
  } catch {
    return false;
  }
}

let entryTracked = false;
/** Records the entry visit once per page load, so remounts and in-app navigation never repeat it. */
export function trackEntryOnce(): void {
  if (typeof window === "undefined" || entryTracked) return;
  const page = entryPageFor(window.location.pathname);
  if (!page) return;
  entryTracked = true;
  void track({ event: "landing_visit", entry_page: page });
}

export function referralUrl(origin: string, projectId: string, code: string | null): string {
  const url = new URL("/project", origin);
  url.searchParams.set("id", projectId);
  if (code) url.searchParams.set("ref", code);
  return url.toString();
}
