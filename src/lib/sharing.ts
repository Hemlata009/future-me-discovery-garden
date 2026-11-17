import { ensureVisitor, referralCodeSchema, referralUrl, track } from "@/lib/tracking";

export type ShareChannel = "copy" | "whatsapp";

/** Returns the same visitor-owned referral link used by every project-share surface. */
export async function getProjectReferral(
  projectId: string,
  origin = window.location.origin,
): Promise<{ code: string | null; url: string }> {
  let code: string | null = null;
  try {
    await ensureVisitor();
    const response = await fetch("/api/referral-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ project_id: projectId }),
    });
    const data = (await response.json().catch(() => null)) as { code?: unknown } | null;
    if (!response.ok) throw new Error("Referral link unavailable");
    const parsed = referralCodeSchema.safeParse(data?.code);
    code = parsed.success ? parsed.data : null;
  } catch {
    code = null;
  }
  return { code, url: referralUrl(origin, projectId, code) };
}

export function parentBriefUrl(origin: string, briefId: string, code?: string | null): string {
  const url = new URL("/parent", origin);
  url.searchParams.set("id", briefId);
  if (code) url.searchParams.set("ref", code);
  return url.toString();
}

/** Keeps project-share analytics identical across the original and decision-card actions. */
export function recordShare(projectId: string | undefined, channel: ShareChannel): void {
  if (projectId) void track({ event: "project_shared", project_id: projectId, channel });
}
