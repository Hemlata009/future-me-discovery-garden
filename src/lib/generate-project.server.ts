// Server-side only. This module runs the AI call with Anthropic's official
// TypeScript SDK, straight against Anthropic's API. The key and the prompt
// never reach the browser: the wizard posts five answers and gets back the
// finished project.
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";

import {
  describeGenerationFailure,
  describeValidationIssues,
  discoveryAnswersSchema,
  generatedProjectOutputFormat,
  normalizeGeneratedProject,
  systemPrompt,
  userPrompt,
  type GeneratedProjectContent,
  type GenerationFailureKind,
} from "@/lib/project-generation";
import { limitMessage, readLimits, type LimitReason } from "@/lib/rate-limit-config";
import { resolveVisitor } from "@/lib/visitor-session.server";
import { recordGrowthEvent } from "@/lib/growth.server";

/** Server-side only: this key must never reach the browser. */
export const ANTHROPIC_KEY_ENV = "ANTHROPIC_API_KEY";
export const DEFAULT_MODEL = "claude-sonnet-5-5";

/** The model can be swapped through server config without touching app code. */
export function modelId(): string {
  return process.env["ANTHROPIC_MODEL"]?.trim() || DEFAULT_MODEL;
}

/** The AI answered, but not with a project the app can show. */
export class UnusableReplyError extends Error {}

/** The AI took the request and refused to answer it. */
export class RefusalError extends Error {}

function headers(extra: Record<string, string> = {}): Headers {
  return new Headers({ "content-type": "application/json", ...extra });
}

function failure(kind: GenerationFailureKind): Response {
  const { status, message } = describeGenerationFailure(kind);
  return Response.json({ ok: false, code: kind, message }, { status, headers: headers() });
}

/**
 * Maps an Anthropic failure to the kind of problem the student should hear
 * about. Terminal statuses keep their own meaning: a rejected key or an empty
 * bill is never reported as a hiccup the student should retry.
 */
export function kindFromError(error: unknown): GenerationFailureKind {
  if (error instanceof RefusalError) return "denied";
  if (error instanceof UnusableReplyError) return "no-object";
  if (error instanceof AuthenticationError) return "auth";
  if (error instanceof PermissionDeniedError) return "denied";
  if (error instanceof RateLimitError) return "rate-limit";
  if (error instanceof BadRequestError) return "bad-request";
  if (error instanceof APIConnectionTimeoutError || error instanceof APIConnectionError) {
    return "network";
  }
  if (error instanceof InternalServerError) return "upstream";
  if (error instanceof APIError) {
    if (error.type === "billing_error" || error.status === 402) return "credits";
    if (error.status === 401) return "auth";
    if (error.status === 403) return "denied";
    if (error.status === 429) return "rate-limit";
    if (error.status === 400) return "bad-request";
    return "upstream";
  }
  // fetch() rejects with TypeError when the connection itself fails.
  if (error instanceof TypeError) return "network";
  return "upstream";
}

/** Strips any code fence, then requires JSON that fits the guard rails. */
export function parseReply(text: string): GeneratedProjectContent {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  let raw: unknown;
  try {
    raw = JSON.parse(stripped);
  } catch {
    throw new UnusableReplyError("The AI's answer was not valid JSON.");
  }
  try {
    return normalizeGeneratedProject(raw);
  } catch (error) {
    throw new UnusableReplyError(
      error instanceof Error ? error.message : "The AI's answer was unusable.",
    );
  }
}

/** Only this site's own pages may ask for a generation. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/**
 * The failure_kind stored on generation_failed. Pre-AI rejections (config,
 * limits) are kept apart from Anthropic errors, invalid replies and save failures.
 */
export type GenerationOutcomeKind =
  | "config"
  | "visitor_limit"
  | "global_limit"
  | "limit_check"
  | "invalid_response"
  | "save"
  | `anthropic:${GenerationFailureKind}`;

export function outcomeKindFor(kind: GenerationFailureKind): GenerationOutcomeKind {
  if (kind === "no-object") return "invalid_response";
  if (kind === "save") return "save";
  if (kind === "config") return "config";
  return `anthropic:${kind}`;
}

export function limitOutcome(reason: LimitReason | undefined): GenerationOutcomeKind {
  return reason === "visitor" ? "visitor_limit" : "global_limit";
}

export async function handleGenerateProject(request: Request): Promise<Response> {
  const visitor = await resolveVisitor(request);
  const response = await generate(request, visitor.hash);
  if (visitor.setCookie) response.headers.append("set-cookie", visitor.setCookie);
  return response;
}

async function generate(request: Request, visitorHash: string): Promise<Response> {
  if (!isSameOrigin(request)) {
    return failure("validation");
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return failure("validation");
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = discoveryAnswersSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { ok: false, code: "validation", message: describeValidationIssues(parsed.error) },
      { status: 400, headers: headers() },
    );
  }
  const answers = parsed.data;
  const answerFields = {
    visitorHash,
    interest: answers.interest,
    technology: answers.technology,
    language: answers.language,
    class_status: answers.class_status,
  };
  await recordGrowthEvent({ event: "discovery_completed", ...answerFields });
  const recordFailure = (kind: GenerationOutcomeKind) =>
    recordGrowthEvent({ event: "generation_failed", failure_kind: kind, ...answerFields });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const apiKey = process.env[ANTHROPIC_KEY_ENV];
  if (!apiKey) {
    console.error("AI generation requested but ANTHROPIC_API_KEY is not configured");
    await recordFailure("config");
    return failure("config");
  }

  // Cost guard: per-visitor limit plus independent site-wide safety caps,
  // claimed atomically in the database.
  const limits = readLimits(process.env);
  const { data: slot, error: slotError } = await supabaseAdmin.rpc("claim_generation_slot", {
    _visitor_hash: visitorHash,
    _visitor_limit: limits.visitorLimit,
    _visitor_window_seconds: limits.visitorWindowSeconds,
    _global_per_minute: limits.globalPerMinute,
    _global_per_day: limits.globalPerDay,
    _daily_token_limit: limits.dailyTokenLimit,
  });
  if (slotError || !slot) {
    console.error("Generation rate check failed", slotError?.message);
    await recordFailure("limit_check");
    return failure("upstream");
  }
  const claim = slot as {
    allowed: boolean;
    reason?: LimitReason;
    retry_after_seconds?: number;
    attempt_id?: string;
  };
  if (!claim.allowed) {
    await recordFailure(limitOutcome(claim.reason));
    const retry = claim.retry_after_seconds ?? 60;
    return Response.json(
      {
        ok: false,
        code: "rate-limit",
        message: limitMessage(claim.reason ?? "global_minute", retry),
        retry_after_seconds: retry,
      },
      { status: 429, headers: headers({ "retry-after": String(retry) }) },
    );
  }
  // Only successful generations count toward a visitor's limit.
  const releaseSlot = async () => {
    if (!claim.attempt_id) return;
    await supabaseAdmin.from("generation_attempts").delete().eq("id", claim.attempt_id);
  };

  const model = modelId();
  const client = new Anthropic({ apiKey, maxRetries: 0 });

  let content: GeneratedProjectContent;
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  try {
    // Native structured output: Claude must answer with exactly the fields the
    // schema below lists, so there is no prose to unpick.
    const stream = client.messages.stream({
      model,
      max_tokens: limits.maxOutputTokens,
      system: systemPrompt(),
      messages: [{ role: "user", content: userPrompt(answers) }],
      output_config: { format: generatedProjectOutputFormat },
    });
    // Consume the stream server-side: the browser only ever sees the finished project.
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new RefusalError("The AI service declined to answer this request.");
    }
    const text = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
    content = parseReply(text);
    usage = message.usage;
  } catch (error) {
    const kind = kindFromError(error);
    console.error(`AI generation failed (${kind})`, error instanceof Error ? error.message : "");
    await releaseSlot();
    await recordFailure(outcomeKindFor(kind));
    return failure(kind);
  }

  const { data, error } = await supabaseAdmin
    .from("generated_projects")
    .insert({
      interest: answers.interest,
      technology: answers.technology,
      project_type: answers.project_type,
      class_status: answers.class_status,
      language: answers.language,
      custom_idea: answers.custom_idea || null,
      generated_content: content,
      model,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      owner_visitor_hash: visitorHash,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Generated project could not be saved", error?.message);
    await releaseSlot();
    await recordFailure("save");
    return failure("save");
  }

  await recordGrowthEvent({ event: "generation_succeeded", projectId: data.id, ...answerFields });

  console.info(
    `Generated project ${data.id} with ${model} (in ${usage?.input_tokens ?? "?"} / out ${
      usage?.output_tokens ?? "?"
    } tokens)`,
  );

  return Response.json(
    {
      ok: true,
      id: data.id,
      generated_content: content,
      model,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
    },
    { status: 200, headers: headers() },
  );
}
