// Browser-only journey memory. Before sign-up, page views (path + visible seconds)
// stay in this browser's localStorage and are uploaded only when the student
// creates an account and consents. After sign-in they are flushed to the server.
// No form values, keystrokes or pointer positions are ever stored.

export type JourneyEntry = { path: string; seconds: number; at: string };
export type InviteRef = { code: string; kind: "parent" | "friend" };

const LOG = "fm_journey_log";
const EXPLORE = "fm_explore_seconds";
const PROMPT = "fm_signup_prompt";
const INVITE = "fm_invite";
export const MAX_LOG = 150;
export const FIRST_PROMPT_SECONDS = 5 * 60;
export const NEXT_PROMPT_SECONDS = 10 * 60;
export const MAX_PROMPTS = 2;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: the journey simply isn't remembered.
  }
}

/** Keeps only the path (no query string or hash), so nothing personal is stored. */
export function cleanPath(path: string): string {
  return (path.split(/[?#]/)[0] || "/").slice(0, 200);
}

export function recordPageView(path: string, seconds: number, at = new Date()) {
  if (seconds < 2) return;
  const log = read<JourneyEntry[]>(LOG, []);
  log.push({
    path: cleanPath(path),
    seconds: Math.min(3600, Math.round(seconds)),
    at: at.toISOString(),
  });
  write(LOG, log.slice(-MAX_LOG));
}
export function readJourney(): JourneyEntry[] {
  const log = read<JourneyEntry[]>(LOG, []);
  return Array.isArray(log) ? log.slice(-MAX_LOG) : [];
}
export function clearJourney() {
  write(LOG, []);
}

export function addExploreSeconds(seconds: number) {
  write(EXPLORE, exploreSeconds() + seconds);
}
export function exploreSeconds(): number {
  const value = read<number>(EXPLORE, 0);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type PromptState = { count: number; at_seconds: number };
/** First prompt after 5 active minutes, a second one 10 minutes later, then never. */
export function shouldPrompt(seconds = exploreSeconds()): boolean {
  const state = read<PromptState>(PROMPT, { count: 0, at_seconds: 0 });
  if (state.count >= MAX_PROMPTS) return false;
  if (state.count === 0) return seconds >= FIRST_PROMPT_SECONDS;
  return seconds >= state.at_seconds + NEXT_PROMPT_SECONDS;
}
export function markPrompted(seconds = exploreSeconds()) {
  const state = read<PromptState>(PROMPT, { count: 0, at_seconds: 0 });
  write(PROMPT, { count: state.count + 1, at_seconds: seconds });
}
export function promptCount(): number {
  return read<PromptState>(PROMPT, { count: 0, at_seconds: 0 }).count;
}

export function captureInvite(search: string): InviteRef | null {
  const params = new URLSearchParams(search);
  const code = params.get("invite");
  if (!code || !/^[A-Za-z0-9]{8,16}$/.test(code)) return null;
  const invite: InviteRef = { code, kind: params.get("for") === "parent" ? "parent" : "friend" };
  write(INVITE, invite);
  return invite;
}
export function storedInvite(): InviteRef | null {
  const invite = read<InviteRef | null>(INVITE, null);
  return invite && /^[A-Za-z0-9]{8,16}$/.test(invite.code) ? invite : null;
}
