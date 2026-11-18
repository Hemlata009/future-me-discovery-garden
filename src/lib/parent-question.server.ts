import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";

import {
  ANTHROPIC_KEY_ENV,
  RefusalError,
  UnusableReplyError,
  kindFromError,
  modelId,
} from "@/lib/generate-project.server";
import { isSameOrigin, recordGrowthEvent } from "@/lib/growth.server";
import { niatFacts } from "@/lib/niat-facts";
import {
  parentAnswerOutputFormat,
  parentAnswerSchema,
  parentBriefContentSchema,
  parentLanguageSchema,
  parentQuestionRequestSchema,
  parentQuestionSystemPrompt,
  parentQuestionUserPrompt,
  type ParentBriefContent,
  type ParentLanguage,
} from "@/lib/parent-experience";
import { describeGenerationFailure } from "@/lib/project-generation";
import { resolveVisitor } from "@/lib/visitor-session.server";

export const PARENT_QUESTION_LIMIT = 3;

export const PARENT_QUESTION_TOOL_NAMES = [
  "get_saved_project",
  "get_parent_brief",
  "get_verified_niat_facts",
] as const;
type ParentQuestionToolName = (typeof PARENT_QUESTION_TOOL_NAMES)[number];

const emptyToolInputSchema = z.object({}).strict();
const toolInputSchema: Tool["input_schema"] = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

const parentQuestionTools: Tool[] = [
  {
    name: "get_saved_project",
    description: "Return the relevant context from the saved project linked to this Parent Brief.",
    input_schema: toolInputSchema,
    strict: true,
    type: "custom",
  },
  {
    name: "get_parent_brief",
    description: "Return the validated content and language of the current saved Parent Brief.",
    input_schema: toolInputSchema,
    strict: true,
    type: "custom",
  },
  {
    name: "get_verified_niat_facts",
    description:
      "Return the existing verified NIAT fact sheet. These are the only allowed NIAT claims.",
    input_schema: toolInputSchema,
    strict: true,
    type: "custom",
  },
];

export type ParentQuestionToolContext = {
  project: { interest: string; technology: string; class_status: string };
  brief: { content: ParentBriefContent; language: ParentLanguage };
};

/** Model arguments select no records: every result is bound to this validated request. */
export function dispatchParentQuestionTool(
  name: string,
  input: unknown,
  context: ParentQuestionToolContext,
): unknown {
  if (!PARENT_QUESTION_TOOL_NAMES.includes(name as ParentQuestionToolName)) {
    throw new UnusableReplyError("The AI requested an unknown Parent Q&A tool.");
  }
  const parsedInput = emptyToolInputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new UnusableReplyError("The AI supplied invalid Parent Q&A tool arguments.");
  }

  switch (name as ParentQuestionToolName) {
    case "get_saved_project":
      return {
        saved_project: {
          interest: context.project.interest,
          technology: context.project.technology,
          class_status: context.project.class_status,
        },
      };
    case "get_parent_brief":
      return { parent_brief: context.brief.content, language: context.brief.language };
    case "get_verified_niat_facts":
      return { niat_facts: niatFacts };
  }
}

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
  const language = parentLanguageSchema.safeParse(brief.language);
  if (!content.success || !language.success)
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
    const messages: MessageParam[] = [
      { role: "user", content: parentQuestionUserPrompt(parsed.data.question) },
    ];
    const toolContext: ParentQuestionToolContext = {
      project: {
        interest: project.interest,
        technology: project.technology,
        class_status: project.class_status,
      },
      brief: { content: content.data, language: language.data },
    };
    const toolsUsed: ParentQuestionToolName[] = [];
    let text = "";

    // This model supports automatic tool choice. Successful answers are still
    // withheld until every required application tool has returned a result.
    for (let round = 0; round < 8; round += 1) {
      const missingTools = PARENT_QUESTION_TOOL_NAMES.filter((name) => !toolsUsed.includes(name));
      const stream = client.messages.stream({
        model: modelId(),
        max_tokens: 700,
        system: parentQuestionSystemPrompt(language.data),
        messages,
        tools: parentQuestionTools,
        tool_choice: { type: missingTools.length ? "auto" : "none" },
        output_config: { format: parentAnswerOutputFormat },
      });
      const message = await stream.finalMessage();
      if (message.stop_reason === "refusal") {
        throw new RefusalError("The AI declined this question.");
      }
      const toolUses = message.content.flatMap((block) =>
        block.type === "tool_use" ? [block] : [],
      );

      if (toolUses.length > 0) {
        if (missingTools.length === 0) {
          throw new UnusableReplyError(
            "The AI requested a tool after all required results arrived.",
          );
        }
        const toolResults: ToolResultBlockParam[] = toolUses.map((toolUse) => ({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(
            dispatchParentQuestionTool(toolUse.name, toolUse.input, toolContext),
          ),
        }));
        for (const toolUse of toolUses) {
          const name = toolUse.name as ParentQuestionToolName;
          if (!toolsUsed.includes(name)) toolsUsed.push(name);
        }
        messages.push({ role: "assistant", content: message.content });
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      if (missingTools.length > 0) {
        messages.push({ role: "assistant", content: message.content });
        messages.push({
          role: "user",
          content: `Do not answer yet. Call these required tools first: ${missingTools.join(", ")}.`,
        });
        continue;
      }

      text = message.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("");
      break;
    }

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
      language: language.data,
      class_status: project.class_status,
    });
    return json({
      ok: true,
      answer: answer.answer,
      remaining: claim.remaining,
      tools_used: toolsUsed,
    });
  } catch (error) {
    const kind = kindFromError(error);
    console.error(`Parent question failed (${kind})`, error instanceof Error ? error.message : "");
    await releaseSlot();
    const result = describeGenerationFailure(kind);
    return json({ ok: false, message: result.message }, result.status);
  }
}
