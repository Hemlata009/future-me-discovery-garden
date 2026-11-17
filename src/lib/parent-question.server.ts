import Anthropic from "@anthropic-ai/sdk";

import {
  ANTHROPIC_KEY_ENV,
  RefusalError,
  UnusableReplyError,
  kindFromError,
  modelId,
} from "@/lib/generate-project.server";
import { isSameOrigin, recordGrowthEvent } from "@/lib/growth.server";
import {
  parentAnswerOutputFormat,
  parentAnswerSchema,
  parentBriefContentSchema,
  parentQuestionRequestSchema,
  parentQuestionSystemPrompt,
  parentQuestionUserPrompt,
} from "@/lib/parent-experience";
import { describeGenerationFailure } from "@/lib/project-generation";
import { resolveVisitor } from "@/lib/visitor-session.server";

export const PARENT_QUESTION_LIMIT = 3;

function json(body: object, status = 200): Response {
  return Response.json(body, { status, headers: { "content-type": "application/json" } });
}

export async function claimParentQuestionSlot(briefId: string, visitorHash: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin.rpc("claim_parent_question", {
    _brief_id: briefId,
    _visitor_hash: visitorHash,
    _limit: PARENT_QUESTION_LIMIT,
  });
}

export async function handleParentQuestion(request: Request): Promise<Response> {
  const visitor = await resolveVisitor(request);
  const response = await answerParentQuestion(request, visitor.hash);
  if (visitor.setCookie) response.headers.append("set-cookie", visitor.setCookie);
  return response;
}

async function answerParentQuestion(request: Request, visitorHash: string): Promise<Response> {
  if (!isSameOrigin(request)) return json({ ok: false, message: "Invalid request origin." }, 403);
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return json({ ok: false, message: "JSON is required." }, 415);
  }
  const parsed = parentQuestionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return json({ ok: false, message: "Enter a question of up to 300 characters." }, 400);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: brief, error: briefError } = await supabaseAdmin
    .from("parent_briefs")
    .select("id, generated_project_id, language, content")
    .eq("id", parsed.data.brief_id)
    .maybeSingle();
  if (briefError || !brief) return json({ ok: false, message: "Parent brief not found." }, 404);
  const content = parentBriefContentSchema.safeParse(brief.content);
  if (!content.success)
    return json({ ok: false, message: "This brief can't answer questions." }, 422);

  const { data: project, error: projectError } = await supabaseAdmin
    .from("generated_projects")
    .select("id, interest, technology, class_status")
    .eq("id", brief.generated_project_id)
    .maybeSingle();
  if (projectError || !project) return json({ ok: false, message: "Project not found." }, 404);

  const { data: slot, error: slotError } = await claimParentQuestionSlot(brief.id, visitorHash);
  if (slotError || !slot) {
    console.error("Parent question limit check failed", slotError?.message);
    return json({ ok: false, message: "Please try again shortly." }, 503);
  }
  const claim = slot as { allowed: boolean; remaining: number; attempt_id?: string };
  if (!claim.allowed) {
    return json(
      {
        ok: false,
        code: "question-limit",
        remaining: 0,
        message:
          "You've used all 3 questions for this brief. Please ask a NIAT counsellor anything else.",
      },
      429,
    );
  }
  const releaseSlot = async () => {
    if (claim.attempt_id)
      await supabaseAdmin.from("parent_question_attempts").delete().eq("id", claim.attempt_id);
  };

  const apiKey = process.env[ANTHROPIC_KEY_ENV];
  if (!apiKey) {
    await releaseSlot();
    return json({ ok: false, message: describeGenerationFailure("config").message }, 500);
  }

  try {
    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const stream = client.messages.stream({
      model: modelId(),
      max_tokens: 700,
      system: parentQuestionSystemPrompt(brief.language as "english" | "hindi" | "telugu"),
      messages: [
        { role: "user", content: parentQuestionUserPrompt(content.data, parsed.data.question) },
      ],
      output_config: { format: parentAnswerOutputFormat },
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new RefusalError("The AI declined this question.");
    const text = message.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");
    let answer;
    try {
      answer = parentAnswerSchema.parse(
        JSON.parse(
          text
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/```\s*$/, ""),
        ),
      );
    } catch (error) {
      throw new UnusableReplyError(error instanceof Error ? error.message : "Unusable answer.");
    }

    await recordGrowthEvent({
      event: "parent_question_asked",
      visitorHash,
      projectId: project.id,
      briefId: brief.id,
      interest: project.interest,
      technology: project.technology,
      language: brief.language,
      class_status: project.class_status,
    });
    return json({ ok: true, answer: answer.answer, remaining: claim.remaining });
  } catch (error) {
    const kind = kindFromError(error);
    console.error(`Parent question failed (${kind})`, error instanceof Error ? error.message : "");
    await releaseSlot();
    const result = describeGenerationFailure(kind);
    return json({ ok: false, message: result.message }, result.status);
  }
}
