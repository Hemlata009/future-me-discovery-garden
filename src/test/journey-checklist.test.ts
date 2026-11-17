import { describe, expect, it } from "vitest";
import { inviteMessage } from "@/lib/family-copy";
import {
  answerChips,
  generationErrorType,
  homePromise,
  isCounsellorFallback,
  inviteValueCopy,
} from "@/lib/journey-copy";
import { referralJourneySteps } from "@/lib/growth-metrics";

describe("explore-before-you-apply checklist rules", () => {
  it("states the homepage promise", () => {
    expect(homePromise).toBe("Five questions. Five minutes. Your own tech project.");
  });
  it("shows the four answers in order", () => {
    const chips = answerChips({
      interest: "gaming",
      technology: "ai",
      project_type: "custom",
      language: "telugu",
    });
    expect(chips.map((c) => c.label)).toEqual(["Interest", "Technology", "Build", "Language"]);
    expect(chips[0]!.value).toBe("Gaming & entertainment");
    expect(chips[2]!.value).toBe("My own idea");
  });
  it("groups generation failures by reason", () => {
    expect(generationErrorType("rate-limit")).toBe("rate-limit");
    expect(generationErrorType("no-object")).toBe("invalid");
    expect(generationErrorType("upstream")).toBe("unavailable");
    expect(generationErrorType("network")).toBe("unavailable");
  });
  it("detects the counsellor fallback answer only", () => {
    expect(isCounsellorFallback("Please ask a NIAT counsellor")).toBe(true);
    expect(isCounsellorFallback("Please ask a NIAT counsellor.")).toBe(true);
    expect(isCounsellorFallback("The degree comes from the partner university.")).toBe(false);
  });
  it("keeps the invite copy free of rewards and localised in three languages", () => {
    expect(inviteValueCopy).not.toMatch(/\b(reward|xp|prize)s?\b/i);
    expect(Object.keys(inviteMessage).sort()).toEqual(["english", "hindi", "telugu"]);
  });
  it("rates each referred-journey step against referred visitors", () => {
    const steps = referralJourneySteps({
      referred_visitors: 10,
      started_discovery: 6,
      completed_discovery: 4,
      application_clicks: 1,
    });
    expect(steps.map((s) => s.value)).toEqual([10, 6, 4, 1]);
    expect(steps[1]!.rate).toBeCloseTo(0.6);
    expect(steps[3]!.rate).toBeCloseTo(0.1);
    expect(
      referralJourneySteps({
        referred_visitors: 0,
        started_discovery: 0,
        completed_discovery: 0,
        application_clicks: 0,
      })[1]!.rate,
    ).toBeNull();
  });
});
