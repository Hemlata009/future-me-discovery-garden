import { afterEach, describe, expect, it } from "vitest";
import {
  APIConnectionError,
  APIError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";

import {
  DEFAULT_MODEL,
  RefusalError,
  UnusableReplyError,
  kindFromError,
  modelId,
  parseReply,
} from "@/lib/generate-project.server";

const savedModel = process.env["ANTHROPIC_MODEL"];

afterEach(() => {
  if (savedModel === undefined) delete process.env["ANTHROPIC_MODEL"];
  else process.env["ANTHROPIC_MODEL"] = savedModel;
});

function apiError(status: number, message: string, type?: APIError["type"]) {
  return new APIError(status, { message }, message, new Headers(), type);
}

describe("AI provider selection", () => {
  it("uses Claude Sonnet 5.5 unless another model is configured", () => {
    delete process.env["ANTHROPIC_MODEL"];
    expect(modelId()).toBe("claude-sonnet-5-5");
    expect(DEFAULT_MODEL).toBe("claude-sonnet-5-5");
  });

  it("lets server config name a different model", () => {
    process.env["ANTHROPIC_MODEL"] = "claude-opus-5-5";
    expect(modelId()).toBe("claude-opus-5-5");
  });
});

describe("Anthropic failure mapping", () => {
  it("calls a rejected key a key problem, not a server hiccup", () => {
    expect(
      kindFromError(new AuthenticationError(401, { message: "bad key" }, "bad key", new Headers())),
    ).toBe("auth");
    expect(kindFromError(apiError(401, "invalid x-api-key"))).toBe("auth");
  });

  it("calls an empty bill a credits problem", () => {
    expect(kindFromError(apiError(402, "insufficient credits", "billing_error"))).toBe("credits");
    expect(kindFromError(apiError(400, "out of credits", "billing_error"))).toBe("credits");
  });

  it("keeps a provider refusal terminal", () => {
    expect(kindFromError(new PermissionDeniedError(403, {}, "no", new Headers()))).toBe("denied");
    expect(kindFromError(new RefusalError("declined"))).toBe("denied");
  });

  it("tells a student to wait when Anthropic is rate limiting", () => {
    expect(kindFromError(new RateLimitError(429, {}, "slow down", new Headers()))).toBe(
      "rate-limit",
    );
  });

  it("separates a bad request from an unreachable service", () => {
    expect(kindFromError(new BadRequestError(400, {}, "bad", new Headers()))).toBe("bad-request");
    expect(kindFromError(new APIConnectionError({ message: "down" }))).toBe("network");
    expect(kindFromError(new TypeError("fetch failed"))).toBe("network");
  });

  it("blames the AI service itself when it breaks or overloads", () => {
    expect(kindFromError(new InternalServerError(529, {}, "overloaded", new Headers()))).toBe(
      "upstream",
    );
    expect(kindFromError(apiError(500, "boom"))).toBe("upstream");
  });

  it("calls an unusable answer a shape problem", () => {
    expect(kindFromError(new UnusableReplyError("not json"))).toBe("no-object");
  });
});

const validReply = {
  title: "Balcony Garden Buddy",
  tagline: "A tiny plant helper for your balcony.",
  interest_connection: "You picked nature and sustainability, so this starts with a real plant.",
  problem: "Balcony gardens quietly die because nobody remembers when the soil runs dry.",
  description:
    "You will build a small assistant that watches one pot and tells you when it needs water, using a cheap moisture sensor and a simple rule you write yourself.",
  difficulty: "Beginner",
  technologies: ["Python", "Machine Learning", "IoT"],
  roadmap: [
    "Pick one plant and write down what you see",
    "Collect soil readings for a week",
    "Turn the readings into a water rule",
    "Show the rule on a simple screen",
  ],
  first_milestone: "Today: log five soil readings and note what each plant looked like.",
  future_extensions: ["Add a weather check", "Send a daily reminder"],
  career_connection: "Sensors and data show up in agricultural technology roles.",
  motivation: "Start with one pot. That is enough to begin.",
};

describe("reading Claude's structured answer", () => {
  it("accepts the JSON Claude sends back", () => {
    expect(parseReply(JSON.stringify(validReply)).title).toBe("Balcony Garden Buddy");
  });

  it("accepts JSON wrapped in a code fence", () => {
    const fenced = "```json\n" + JSON.stringify(validReply) + "\n```";
    expect(parseReply(fenced).difficulty).toBe("Beginner");
  });

  it("refuses an answer that is not JSON", () => {
    expect(() => parseReply("Sure! Here is a great project for you.")).toThrow(UnusableReplyError);
  });

  it("refuses an answer missing a field", () => {
    const { motivation: _motivation, ...incomplete } = validReply;
    expect(() => parseReply(JSON.stringify(incomplete))).toThrow(UnusableReplyError);
  });
});
