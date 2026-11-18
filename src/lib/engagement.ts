// Browser-safe active engagement measurement. No form values, keystroke contents
// or pointer coordinates are read or sent.
import { z } from "zod";

import { ensureVisitor } from "@/lib/tracking";

export const engagementPayloadSchema = z
  .object({
    session_id: z.string().uuid(),
    generated_project_id: z.string().uuid().nullable(),
  })
  .strict();

const HEARTBEAT_MS = 30_000;
const RECENT_INTERACTION_MS = 60_000;

function publicEngagementPath(pathname: string): boolean {
  return !["/admin", "/counsellor", "/auth"].includes(pathname) && !pathname.startsWith("/api/");
}

function generatedProjectId(search: string): string | null {
  if (new URLSearchParams(search).has("id") === false) return null;
  const id = new URLSearchParams(search).get("id");
  return z.string().uuid().safeParse(id).success ? id : null;
}

/** Starts one heartbeat loop per browser tab; hidden and inactive time is never submitted. */
export function startEngagementHeartbeat(): () => void {
  if (typeof window === "undefined" || !publicEngagementPath(window.location.pathname)) {
    return () => {};
  }

  const storageKey = "fm_engagement_session";
  let sessionId = sessionStorage.getItem(storageKey) ?? "";
  if (!z.string().uuid().safeParse(sessionId).success) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(storageKey, sessionId);
  }
  let lastInteraction = Date.now();
  let stopped = false;
  const projectId = generatedProjectId(window.location.search);
  const interacted = () => {
    lastInteraction = Date.now();
  };
  const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
  for (const event of events) window.addEventListener(event, interacted, { passive: true });

  const beat = async () => {
    if (
      stopped ||
      document.visibilityState !== "visible" ||
      Date.now() - lastInteraction > RECENT_INTERACTION_MS
    ) {
      return;
    }
    try {
      await ensureVisitor();
      const response = await fetch("/api/engagement", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, generated_project_id: projectId }),
      });
      const result = (await response.json().catch(() => null)) as { result?: string } | null;
      if (result?.result === "expired") {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem(storageKey, sessionId);
      }
    } catch {
      // Measurement is best-effort and must never interrupt the student journey.
    }
  };

  void beat();
  const timer = window.setInterval(() => void beat(), HEARTBEAT_MS);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    for (const event of events) window.removeEventListener(event, interacted);
  };
}
