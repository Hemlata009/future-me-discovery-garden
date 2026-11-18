import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const anthropicStream = vi.fn();
const recordGrowthEvent = vi.fn();
const adminRpc = vi.fn();
const adminFrom = vi.fn();
const releaseAttemptEq = vi.fn();

vi.mock("@anthropic-ai/sdk", async (original) => {
  const actual = await original<typeof import("@anthropic-ai/sdk")>();
  return {
    ...actual,
    default: class MockAnthropic {
      messages = {
        stream: (params: unknown) => anthropicStream(structuredClone(params)),
      };
    },
  };
});
vi.mock("@/lib/growth.server", async (original) => ({
  ...(await original<typeof import("@/lib/growth.server")>()),
  recordGrowthEvent: (...args: unknown[]) => recordGrowthEvent(...args),
}));
vi.mock("@/lib/visitor-session.server", () => ({
  resolveVisitor: async () => ({ hash: "visitor-hash" }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => adminRpc(...args),
    from: (...args: unknown[]) => adminFrom(...args),
  },
}));

import { niatFacts } from "@/lib/niat-facts";
import {
  dispatchParentQuestionTool,
  handleParentQuestion,
  PARENT_QUESTION_TOOL_NAMES,
  type ParentQuestionToolContext,
} from "@/lib/parent-question.server";

const briefId = "2c9ff70e-6678-450d-8c46-26d8078ca361";
const projectId = "6f1c2c1e-1b2a-4c3d-8e9f-0a1b2c3d4e5f";
const validBrief = {
  headline: "A practical start in technology",
  what_your_child_explored: "Your child explored how a sensor can help a plant.",
  project_summary: "They designed a small project that observes soil and suggests when to water.",
  why_this_fits: "It connects their interest in nature with a manageable first technology build.",
  what_niat_is_and_is_not:
    "NIAT is an upskilling initiative by NxtWave. The B.Tech degree is awarded by the partner university, not NIAT.",
  questions_to_ask_a_counsellor: [
    "Which partner university applies here?",
    "What does the first year cover?",
    "What are the current fees and eligibility rules?",
  ],
};
const toolContext: ParentQuestionToolContext = {
  project: { interest: "science", technology: "iot", class_status: "class12" },
  brief: { content: validBrief, language: "english" },
};

function toolReply(id: string, name: string, input: unknown = {}) {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name, input }],
  };
}

function finalReply(answer: string) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify({ answer }) }],
  };
}

function queueReplies(...replies: unknown[]) {
  for (const reply of replies) {
    anthropicStream.mockReturnValueOnce({ finalMessage: vi.fn().mockResolvedValue(reply) });
  }
}

function ask(question = "What is NIAT?") {
  return handleParentQuestion(
    new Request("https://futureme.example/api/parent-question", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brief_id: briefId, question }),
    }),
  );
}

type TestRequest = {
  tools: Array<{
    name: string;
    strict: boolean;
    input_schema: { additionalProperties: boolean };
  }>;
  messages: Array<{ role: string; content: unknown }>;
};

function requestAt(index: number): TestRequest {
  return anthropicStream.mock.calls[index]?.[0] as TestRequest;
}

function lastToolResult(request: TestRequest) {
  const message = request.messages.at(-1);
  if (!message || message.role !== "user" || !Array.isArray(message.content)) {
    throw new Error("Missing tool-result message");
  }
  return message.content.at(-1) as { tool_use_id: string; content: string };
}

const originalApiKey = process.env["ANTHROPIC_API_KEY"];

describe("Parent Q&A Anthropic tools", () => {
  beforeEach(() => {
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    anthropicStream.mockReset();
    recordGrowthEvent.mockReset();
    adminRpc.mockReset();
    adminFrom.mockReset();
    releaseAttemptEq.mockReset();
    releaseAttemptEq.mockResolvedValue({ error: null });
    adminRpc.mockResolvedValue({
      data: { allowed: true, remaining: 2, attempt_id: "attempt-1" },
      error: null,
    });
    adminFrom.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "parent_briefs"
              ? {
                  data: {
                    id: briefId,
                    generated_project_id: projectId,
                    language: "english",
                    content: validBrief,
                  },
                  error: null,
                }
              : { data: { id: projectId, ...toolContext.project }, error: null },
        }),
      }),
      delete: () => ({ eq: releaseAttemptEq }),
    }));
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env["ANTHROPIC_API_KEY"];
    else process.env["ANTHROPIC_API_KEY"] = originalApiKey;
  });

  it("executes all three tools, matches every tool_use_id, then returns the answer", async () => {
    queueReplies(
      toolReply("project-call", "get_saved_project"),
      toolReply("brief-call", "get_parent_brief"),
      toolReply("facts-call", "get_verified_niat_facts"),
      finalReply("NIAT is an upskilling initiative by NxtWave."),
    );

    const response = await ask();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      answer: "NIAT is an upskilling initiative by NxtWave.",
      remaining: 2,
      tools_used: [...PARENT_QUESTION_TOOL_NAMES],
    });
    expect(anthropicStream).toHaveBeenCalledTimes(4);

    const firstRequest = requestAt(0);
    expect(firstRequest.tools.map((tool) => tool.name)).toEqual(PARENT_QUESTION_TOOL_NAMES);
    expect(
      firstRequest.tools.every(
        (tool) => tool.strict && tool.input_schema.additionalProperties === false,
      ),
    ).toBe(true);

    const projectResult = lastToolResult(requestAt(1));
    expect(projectResult.tool_use_id).toBe("project-call");
    expect(JSON.parse(projectResult.content)).toEqual({ saved_project: toolContext.project });

    const briefResult = lastToolResult(requestAt(2));
    expect(briefResult.tool_use_id).toBe("brief-call");
    expect(JSON.parse(briefResult.content)).toEqual({
      parent_brief: validBrief,
      language: "english",
    });

    const factsResult = lastToolResult(requestAt(3));
    expect(factsResult.tool_use_id).toBe("facts-call");
    expect(JSON.parse(factsResult.content)).toEqual({ niat_facts: niatFacts });
    expect(recordGrowthEvent).toHaveBeenCalledTimes(1);
  });

  it("continues an early answer until all tool results are supplied", async () => {
    queueReplies(
      finalReply("An answer without its sources."),
      toolReply("project-call", "get_saved_project"),
      toolReply("brief-call", "get_parent_brief"),
      toolReply("facts-call", "get_verified_niat_facts"),
      finalReply("The B.Tech degree is awarded by the partner university."),
    );
    const response = await ask();
    expect(response.status).toBe(200);
    expect(anthropicStream).toHaveBeenCalledTimes(5);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ tools_used: [...PARENT_QUESTION_TOOL_NAMES] }),
    );
    const reminder = requestAt(1).messages.at(-1);
    expect(reminder).toEqual({
      role: "user",
      content:
        "Do not answer yet. Call these required tools first: get_saved_project, get_parent_brief, get_verified_niat_facts.",
    });
    expect(recordGrowthEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown tool names", () => {
    expect(() => dispatchParentQuestionTool("get_any_private_project", {}, toolContext)).toThrow(
      "unknown Parent Q&A tool",
    );
  });

  it("rejects model-supplied record IDs instead of changing the validated context", async () => {
    queueReplies(
      toolReply("malicious-call", "get_saved_project", {
        project_id: "00000000-0000-4000-8000-000000000000",
        brief_id: "00000000-0000-4000-8000-000000000001",
      }),
    );
    const response = await ask();
    expect(response.status).toBe(502);
    expect(anthropicStream).toHaveBeenCalledTimes(1);
    expect(recordGrowthEvent).not.toHaveBeenCalled();
    expect(releaseAttemptEq).toHaveBeenCalledWith("id", "attempt-1");
  });

  it("still rejects an outcome promise after a complete tool conversation", async () => {
    queueReplies(
      toolReply("project-call", "get_saved_project"),
      toolReply("brief-call", "get_parent_brief"),
      toolReply("facts-call", "get_verified_niat_facts"),
      finalReply("This guarantees a job."),
    );
    const response = await ask();
    expect(response.status).toBe(502);
    expect(recordGrowthEvent).not.toHaveBeenCalled();
    expect(releaseAttemptEq).toHaveBeenCalledWith("id", "attempt-1");
  });
});
