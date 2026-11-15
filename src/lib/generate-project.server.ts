import { APICallError, NoObjectGeneratedError, Output, streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
} from "@/lib/ai-gateway-run-id";
import {
  describeGenerationFailure,
  describeValidationIssues,
  generatedProjectModelSchema,
  normalizeGeneratedProject,
  systemPrompt,
  userPrompt,
  discoveryAnswersSchema,
  type GenerationFailureKind,
} from "@/lib/project-generation";

const GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev/v1";
const DEFAULT_MODEL = "anthropic/claude-sonnet-5";
const MAX_OUTPUT_TOKENS = 4096;
const GENERATIONS_PER_MINUTE = 10;

function failure(
  kind: GenerationFailureKind,
  runId?: string,
  override?: { status?: number; message?: string },
) {
  const base = describeGenerationFailure(kind);
  const status = override?.status ?? base.status;
  const message = override?.message ?? base.message;
  const headers = getLovableAiGatewayResponseHeaders(undefined, {
    "content-type": "application/json",
  });
  if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
  return Response.json(
    { ok: false, code: kind, message },
    { status, headers: getLovableAiGatewayResponseHeaders(headers) },
  );
}

function kindFromError(error: unknown): GenerationFailureKind {
  if (error instanceof NoObjectGeneratedError) return "no-object";
  if (error instanceof APICallError) {
    const status = error.statusCode ?? 0;
    if (status === 401) return "config";
    if (status === 402) return "credits";
    if (status === 403) return "denied";
    if (status === 429) return "rate-limit";
    return "upstream";
  }
  if (error instanceof TypeError) return "network";
  return "upstream";
}

/** The gateway's own user-facing reason, when the response body carries one. */
function gatewayReason(error: APICallError): string | undefined {
  const raw = error.responseBody;
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const body = JSON.parse(raw) as { message?: unknown; error?: { message?: unknown } };
    const candidate =
      typeof body.message === "string"
        ? body.message
        : typeof body.error?.message === "string"
          ? body.error.message
          : undefined;
    const clean = candidate?.trim().replace(/\s+/g, " ").slice(0, 300);
    return clean && clean.length > 8 ? clean : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Terminal failures keep the gateway's status and safe reason instead of being
 * rewritten into a generic 502 the student would retry pointlessly.
 */
function upstreamDetail(error: unknown): { status?: number; message?: string } {
  if (!(error instanceof APICallError)) return {};
  const status = error.statusCode ?? 0;
  if (status === 403) {
    return { status: 403, message: gatewayReason(error) ?? describeGenerationFailure("denied").message };
  }
  if (status === 402) {
    return { status: 402, message: gatewayReason(error) ?? describeGenerationFailure("credits").message };
  }
  if (status === 400) {
    return {
      status: 400,
      message: "The AI service couldn't use that request. Please try generating again.",
    };
  }
  return {};
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

export async function handleGenerateProject(request: Request): Promise<Response> {
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
    const headers = getLovableAiGatewayResponseHeaders(undefined, {
      "content-type": "application/json",
    });
    return Response.json(
      {
        ok: false,
        code: "validation",
        message: describeValidationIssues(parsed.error),
      },
      { status: 400, headers },
    );
  }
  const answers = parsed.data;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Cost guard: a public form must not be able to run the AI in a loop.
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const { count, error: countError } = await supabaseAdmin
    .from("generated_projects")
    .select("id", { count: "exact", head: true })
    .gte("created_at", windowStart);
  if (countError) console.error("Generation rate check failed", countError);
  if (count !== null && count >= GENERATIONS_PER_MINUTE) {
    return failure("rate-limit");
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    console.error("AI generation requested but LOVABLE_API_KEY is not configured");
    return failure("config");
  }

  const model = process.env["ANTHROPIC_MODEL"]?.trim() || DEFAULT_MODEL;
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const anthropic = createAnthropic({
    baseURL: GATEWAY_BASE_URL,
    apiKey,
    headers: { "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  let content;
  let usage;
  try {
    const result = streamText({
      model: anthropic(model),
      system: systemPrompt(),
      prompt: userPrompt(answers),
      output: Output.object({
        name: "student_project",
        description: "A personalized, beginner-friendly technology project for this student.",
        schema: generatedProjectModelSchema,
      }),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 0,
    });
    // Consume the stream server-side: the browser only ever sees the finished project.
    content = normalizeGeneratedProject(await result.output);
    usage = await result.usage;
  } catch (error) {
    const kind = kindFromError(error);
    console.error(`AI generation failed (${kind})`, error);
    return failure(kind, runIdFetch.getRunId(), upstreamDetail(error));
  }

  const runId = runIdFetch.getRunId();
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
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Generated project could not be saved", error);
    return failure("save", runId);
  }

  console.info(
    `Generated project ${data.id} with ${model} (in ${usage?.inputTokens ?? "?"} / out ${
      usage?.outputTokens ?? "?"
    } tokens, run ${runId ?? "unknown"})`,
  );

  const headers = getLovableAiGatewayResponseHeaders(
    undefined,
    new Headers({ "content-type": "application/json" }),
  );
  if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);

  return Response.json(
    {
      ok: true,
      id: data.id,
      generated_content: content,
      model,
      input_tokens: usage?.inputTokens ?? null,
      output_tokens: usage?.outputTokens ?? null,
    },
    { status: 200, headers: getLovableAiGatewayResponseHeaders(headers) },
  );
}
