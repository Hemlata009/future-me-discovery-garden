import Anthropic from "@anthropic-ai/sdk";

import {
  ANTHROPIC_KEY_ENV,
  RefusalError,
  UnusableReplyError,
  kindFromError,
  limitOutcome,
  modelId,
  outcomeKindFor,
  type GenerationOutcomeKind,
} from "@/lib/generate-project.server";
import { recordGrowthEvent, isSameOrigin } from "@/lib/growth.server";
import {
  parentBriefContentSchema,
  parentBriefOutputFormat,
  parentBriefRequestSchema,
  parentBriefSystemPrompt,
  parentBriefUserPrompt,
  parseStoredProjectContent,
  type ParentBriefContent,
} from "@/lib/parent-experience";
import { describeGenerationFailure } from "@/lib/project-generation";
import { limitMessage, readLimits, type LimitReason } from "@/lib/rate-limit-config";
import { resolveVisitor } from "@/lib/visitor-session.server";

function json(body: object, status = 200): Response {
  return Response.json(body, { status, headers: { "content-type": "application/json" } });
}

function failure(kind: Parameters<typeof describeGenerationFailure>[0]): Response {
  const result = describeGenerationFailure(kind);
  return json({ ok: false, code: kind, message: result.message }, result.status);
}

export function parseParentBriefReply(text: string): ParentBriefContent {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  try {
    return parentBriefContentSchema.parse(JSON.parse(stripped));
  } catch (error) {
    throw new UnusableReplyError(error instanceof Error ? error.message : "Unusable parent brief.");
  }
}

export async function handleParentBrief(request: Request): Promise<Response> {
  const visitor = await resolveVisitor(request);
  const response = await generateParentBrief(request, visitor.hash);
  if (visitor.setCookie) response.headers.append("set-cookie", visitor.setCookie);
  return response;
}

async function generateParentBrief(request: Request, visitorHash: string): Promise<Response> {
  if (!isSameOrigin(request)) return json({ ok: false, message: "Invalid request origin." }, 403);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return json({ ok: false, message: "JSON is required." }, 415);
  }
  const parsed = parentBriefRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, message: "Choose a project and language." }, 400);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: project, error: projectError } = await supabaseAdmin
    .from("generated_projects")
    .select("id, interest, technology, project_type, class_status, custom_idea, generated_content")
    .eq("id", parsed.data.project_id)
    .maybeSingle();
  if (projectError || !project) return json({ ok: false, message: "Project not found." }, 404);

  let savedContent;
  try {
    savedContent = parseStoredProjectContent(project.generated_content);
  } catch {
    return json({ ok: false, message: "This project can't be used for a parent brief." }, 422);
  }

  const eventFields = {
    visitorHash,
    projectId: project.id,
    interest: project.interest,
    technology: project.technology,
    language: parsed.data.language,
    class_status: project.class_status,
  };
  const recordFailure = (kind: GenerationOutcomeKind) =>
    recordGrowthEvent({ event: "parent_brief_failed", failure_kind: kind, ...eventFields });

  const apiKey = process.env[ANTHROPIC_KEY_ENV];
  if (!apiKey) {
    console.error("Parent brief requested but the AI key is not configured");
    await recordFailure("config");
    return failure("config");
  }

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
    console.error("Parent brief rate check failed", slotError?.message);
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
      {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": String(retry) },
      },
    );
  }
  const releaseSlot = async () => {
    if (claim.attempt_id)
      await supabaseAdmin.from("generation_attempts").delete().eq("id", claim.attempt_id);
  };

  const model = modelId();
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  let content: ParentBriefContent;
  try {
    const stream = client.messages.stream({
      model,
      max_tokens: limits.maxOutputTokens,
      system: parentBriefSystemPrompt(parsed.data.language),
      messages: [
        {
          role: "user",
          content: parentBriefUserPrompt({
            interest: project.interest,
            technology: project.technology,
            project_type: project.project_type,
            class_status: project.class_status,
            custom_idea: project.custom_idea,
            generated_content: savedContent,
          }),
        },
      ],
      output_config: { format: parentBriefOutputFormat },
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal")
      throw new RefusalError("The AI declined this parent brief.");
    const text = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
    content = parseParentBriefReply(text);
  } catch (error) {
    const kind = kindFromError(error);
    console.error(
      `Parent brief generation failed (${kind})`,
      error instanceof Error ? error.message : "",
    );
    await releaseSlot();
    await recordFailure(outcomeKindFor(kind));
    return failure(kind);
  }

  const { data: brief, error: saveError } = await supabaseAdmin
    .from("parent_briefs")
    .insert({ generated_project_id: project.id, language: parsed.data.language, content })
    .select("id")
    .single();
  if (saveError || !brief) {
    console.error("Parent brief could not be saved", saveError?.message);
    await releaseSlot();
    await recordFailure("save");
    return failure("save");
  }

  await recordGrowthEvent({ event: "parent_brief_generated", briefId: brief.id, ...eventFields });
  return json({ ok: true, brief_id: brief.id });
}
