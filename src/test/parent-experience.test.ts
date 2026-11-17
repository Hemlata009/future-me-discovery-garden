import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recordGrowthEvent = vi.fn();
vi.mock("@/lib/growth.server", async (original) => ({
  ...(await original<typeof import("@/lib/growth.server")>()),
  recordGrowthEvent: (...args: unknown[]) => recordGrowthEvent(...args),
}));
const adminRpc = vi.fn();
const adminFrom = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => adminRpc(...args),
    from: (...args: unknown[]) => adminFrom(...args),
  },
}));

import { familyFunnel, type GrowthTotals } from "@/lib/growth-metrics";
import {
  counsellorRequestSchema,
  parentAnswerSchema,
  parentBriefContentSchema,
  parentBriefRequestSchema,
  parentQuestionRequestSchema,
} from "@/lib/parent-experience";
import { handleParentQuestion, PARENT_QUESTION_LIMIT } from "@/lib/parent-question.server";
import {
  assertNiatFactsSafe,
  hasProhibitedOutcomeFigure,
  niatFacts,
  NIAT_SOURCE_URL,
} from "@/lib/niat-facts";
import { isQualifiedReferral } from "@/lib/referral-qualification";
import { parentBriefUrl } from "@/lib/sharing";
import { trackPayloadSchema } from "@/lib/tracking";

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

const validCounsellorRequest = {
  generated_project_id: "6f1c2c1e-1b2a-4c3d-8e9f-0a1b2c3d4e5f",
  contact_name: "Test Parent",
  phone: "9876543210",
  who: "parent" as const,
  language: "english" as const,
  consent: true as const,
};

describe("NIAT fact-sheet guard", () => {
  it("contains exactly the seven supplied facts with the official source", () => {
    expect(niatFacts).toHaveLength(7);
    expect(niatFacts.every((fact) => fact.source_url === NIAT_SOURCE_URL)).toBe(true);
    expect(assertNiatFactsSafe()).toBe(true);
  });
  it.each(["8 LPA", "12 lakh", "3 crore", "4.5lpa"])(
    "rejects the prohibited outcome figure %s",
    (text) => {
      expect(hasProhibitedOutcomeFigure(text)).toBe(true);
    },
  );
  it("allows factual year and degree wording without monetary outcome figures", () => {
    expect(hasProhibitedOutcomeFigure(niatFacts[2]!.text)).toBe(false);
    expect(parentBriefContentSchema.safeParse(validBrief).success).toBe(true);
  });
  it("rejects an outcome promise in a parent answer", () => {
    expect(parentAnswerSchema.safeParse({ answer: "This guarantees a job." }).success).toBe(false);
    expect(parentAnswerSchema.safeParse({ answer: "Please ask a NIAT counsellor" }).success).toBe(
      true,
    );
  });
});

describe("parent endpoint schemas", () => {
  it("builds the public parent link with the existing project referral code", () => {
    const url = new URL(
      parentBriefUrl(
        "https://futureme.example",
        "2c9ff70e-6678-450d-8c46-26d8078ca361",
        "dvcFLjPfXGD2",
      ),
    );
    expect(url.pathname).toBe("/parent");
    expect(url.searchParams.get("id")).toBe("2c9ff70e-6678-450d-8c46-26d8078ca361");
    expect(url.searchParams.get("ref")).toBe("dvcFLjPfXGD2");
  });
  it("requires a saved project id and a supported brief language", () => {
    expect(
      parentBriefRequestSchema.safeParse({
        project_id: validCounsellorRequest.generated_project_id,
        language: "english",
      }).success,
    ).toBe(true);
    expect(
      parentBriefRequestSchema.safeParse({ project_id: "new", language: "english" }).success,
    ).toBe(false);
    expect(
      parentBriefRequestSchema.safeParse({ ...validCounsellorRequest, language: "french" }).success,
    ).toBe(false);
  });
  it("limits a parent question to 300 characters", () => {
    const brief_id = "2c9ff70e-6678-450d-8c46-26d8078ca361";
    expect(
      parentQuestionRequestSchema.safeParse({ brief_id, question: "What is NIAT?" }).success,
    ).toBe(true);
    expect(
      parentQuestionRequestSchema.safeParse({ brief_id, question: "x".repeat(301) }).success,
    ).toBe(false);
  });
  it("requires explicit consent", () => {
    expect(counsellorRequestSchema.safeParse(validCounsellorRequest).success).toBe(true);
    expect(
      counsellorRequestSchema.safeParse({ ...validCounsellorRequest, consent: false }).success,
    ).toBe(false);
    expect(
      counsellorRequestSchema.safeParse({ ...validCounsellorRequest, consent: undefined }).success,
    ).toBe(false);
  });
  it("accepts only a 10-digit Indian mobile beginning with 6 to 9", () => {
    for (const phone of ["5876543210", "987654321", "98765432100", "+919876543210"]) {
      expect(counsellorRequestSchema.safeParse({ ...validCounsellorRequest, phone }).success).toBe(
        false,
      );
    }
    expect(counsellorRequestSchema.safeParse(validCounsellorRequest).success).toBe(true);
  });
  it("requires brief ids and share channels in browser tracking", () => {
    const brief_id = "2c9ff70e-6678-450d-8c46-26d8078ca361";
    expect(trackPayloadSchema.safeParse({ event: "parent_brief_opened", brief_id }).success).toBe(
      true,
    );
    expect(trackPayloadSchema.safeParse({ event: "parent_brief_opened" }).success).toBe(false);
    expect(
      trackPayloadSchema.safeParse({ event: "parent_brief_shared", brief_id, channel: "copy" })
        .success,
    ).toBe(true);
    expect(trackPayloadSchema.safeParse({ event: "parent_brief_shared", brief_id }).success).toBe(
      false,
    );
    expect(
      trackPayloadSchema.safeParse({ event: "cta_clicked", cta: "start_application" }).success,
    ).toBe(true);
    expect(
      trackPayloadSchema.safeParse({ event: "cta_clicked", cta: "talk_to_counsellor" }).success,
    ).toBe(true);
  });
});

describe("parent question rate limit", () => {
  beforeEach(() => {
    process.env["VISITOR_HASH_SALT"] = "s".repeat(40);
    recordGrowthEvent.mockReset();
    adminRpc.mockReset();
    adminFrom.mockReset();
    adminFrom.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "parent_briefs"
              ? {
                  data: {
                    id: "2c9ff70e-6678-450d-8c46-26d8078ca361",
                    generated_project_id: validCounsellorRequest.generated_project_id,
                    language: "english",
                    content: validBrief,
                  },
                  error: null,
                }
              : {
                  data: {
                    id: validCounsellorRequest.generated_project_id,
                    interest: "science",
                    technology: "iot",
                    class_status: "class12",
                  },
                  error: null,
                },
        }),
      }),
    }));
  });
  afterEach(() => delete process.env["VISITOR_HASH_SALT"]);

  it("uses an atomic limit of three and refuses the next claim", async () => {
    expect(PARENT_QUESTION_LIMIT).toBe(3);
    adminRpc.mockResolvedValue({ data: { allowed: false, remaining: 0 }, error: null });
    const response = await handleParentQuestion(
      new Request("https://futureme.example/api/parent-question", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: `fm_vid=${"b".repeat(43)}` },
        body: JSON.stringify({
          brief_id: "2c9ff70e-6678-450d-8c46-26d8078ca361",
          question: "What is NIAT?",
        }),
      }),
    );
    expect(response.status).toBe(429);
    expect(adminRpc).toHaveBeenCalledWith(
      "claim_parent_question",
      expect.objectContaining({ _limit: 3 }),
    );
    expect(recordGrowthEvent).not.toHaveBeenCalled();
  });
});

describe("qualified referrals and family rates", () => {
  const referral = {
    firstTouchReferralCode: "dvcFLjPfXGD2",
    visitorHash: "visitor-b",
    linkOwnerVisitorHash: "visitor-a",
  };
  it("qualifies only a non-owner first-touch referral who completed a discovery", () => {
    expect(isQualifiedReferral({ ...referral, completedDiscoveries: 1 })).toBe(true);
    expect(isQualifiedReferral({ ...referral, completedDiscoveries: 0 })).toBe(false);
    expect(
      isQualifiedReferral({ ...referral, visitorHash: "visitor-a", completedDiscoveries: 1 }),
    ).toBe(false);
    expect(
      isQualifiedReferral({ ...referral, firstTouchReferralCode: null, completedDiscoveries: 1 }),
    ).toBe(false);
  });
  it("uses a dash-ready null conversion when a family-funnel denominator is zero", () => {
    const totals = {
      briefs_generated: 0,
      briefs_shared: 0,
      briefs_opened: 0,
      parent_questions: 0,
      counsellor_requests: 0,
      application_clicks: 0,
    } as GrowthTotals;
    expect(familyFunnel(totals).map((step) => step.conversion)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(familyFunnel({ ...totals, briefs_generated: 2, briefs_shared: 1 })[1]).toEqual({
      value: 1,
      conversion: 0.5,
    });
  });
});

describe("NIAT summary points", () => {
  it("accepts 4–5 separate points for new briefs and rejects 3", async () => {
    const { parentBriefContentSchema: schema } = await import("@/lib/parent-experience");
    const points = [
      "NIAT is an upskilling initiative by NxtWave.",
      "It is not a university or degree-awarding body.",
      "The B.Tech degree is awarded by the partner university.",
      "Ask a NIAT counsellor about anything not listed here.",
    ];
    expect(schema.safeParse({ ...validBrief, what_niat_is_and_is_not: points }).success).toBe(true);
    expect(
      schema.safeParse({ ...validBrief, what_niat_is_and_is_not: points.slice(0, 3) }).success,
    ).toBe(false);
  });

  it("still loads older briefs saved as one string and splits them into points", async () => {
    const { parentBriefContentSchema: schema, niatSummaryPoints } =
      await import("@/lib/parent-experience");
    expect(schema.safeParse(validBrief).success).toBe(true);
    expect(niatSummaryPoints(validBrief.what_niat_is_and_is_not)).toEqual([
      "NIAT is an upskilling initiative by NxtWave.",
      "The B.Tech degree is awarded by the partner university, not NIAT.",
    ]);
  });
});
