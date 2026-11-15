// Browser-safe: pure helpers for the generation limits. Values come from
// server env at call time (see generation-limits.server.ts).

export type GenerationLimits = {
  visitorLimit: number;
  visitorWindowSeconds: number;
  globalPerMinute: number;
  globalPerDay: number;
  dailyTokenLimit: number;
  maxOutputTokens: number;
};

export const DEFAULT_LIMITS: GenerationLimits = {
  visitorLimit: 3,
  visitorWindowSeconds: 900,
  globalPerMinute: 60,
  globalPerDay: 500,
  dailyTokenLimit: 0,
  maxOutputTokens: 4096,
};

function positiveInt(raw: string | undefined, fallback: number, allowZero = false): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || (!allowZero && n === 0)) return fallback;
  return n;
}

export function readLimits(env: Record<string, string | undefined>): GenerationLimits {
  return {
    visitorLimit: positiveInt(env["VISITOR_GENERATIONS_LIMIT"], DEFAULT_LIMITS.visitorLimit),
    visitorWindowSeconds: positiveInt(
      env["VISITOR_GENERATIONS_WINDOW_SECONDS"],
      DEFAULT_LIMITS.visitorWindowSeconds,
    ),
    globalPerMinute: positiveInt(
      env["GLOBAL_GENERATIONS_PER_MINUTE"],
      DEFAULT_LIMITS.globalPerMinute,
    ),
    globalPerDay: positiveInt(env["GLOBAL_GENERATIONS_PER_DAY"], DEFAULT_LIMITS.globalPerDay),
    dailyTokenLimit: positiveInt(env["DAILY_TOKEN_LIMIT"], DEFAULT_LIMITS.dailyTokenLimit, true),
    maxOutputTokens: positiveInt(
      env["MAX_OUTPUT_TOKENS_PER_GENERATION"],
      DEFAULT_LIMITS.maxOutputTokens,
    ),
  };
}

export type LimitReason = "visitor" | "global_minute" | "global_day" | "global_tokens";

export function limitMessage(reason: LimitReason, retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const when = minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
  if (reason === "visitor") {
    return `You've made a few projects in a row. Take a look at them, then try again in ${when}.`;
  }
  if (reason === "global_minute") {
    return "Lots of students are generating projects right now. Please try again in about a minute.";
  }
  return "FutureMe AI has reached today's project limit. Please come back a little later.";
}
