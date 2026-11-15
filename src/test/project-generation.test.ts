import { describe, expect, it } from "vitest";

import {
  demoThemeForInterest,
  describeGenerationFailure,
  describeValidationIssues,
  discoveryAnswersSchema,
  normalizeGeneratedProject,
  systemPrompt,
  userPrompt,
} from "@/lib/project-generation";

const answers = {
  interest: "farming",
  technology: "ai",
  project_type: "solution",
  class_status: "class12",
  language: "english",
} as const;

const generated = {
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

describe("discovery answers", () => {
  it("accepts the five wizard answers", () => {
    expect(discoveryAnswersSchema.safeParse(answers).success).toBe(true);
  });

  it("rejects an invented interest, technology or language", () => {
    expect(discoveryAnswersSchema.safeParse({ ...answers, interest: "crypto" }).success).toBe(false);
    expect(discoveryAnswersSchema.safeParse({ ...answers, technology: "quantum" }).success).toBe(
      false,
    );
    expect(discoveryAnswersSchema.safeParse({ ...answers, language: "tamil" }).success).toBe(false);
  });

  it("rejects a payload with a missing answer", () => {
    const { technology: _technology, ...incomplete } = answers;
    expect(discoveryAnswersSchema.safeParse(incomplete).success).toBe(false);
  });

  it("rejects an own-idea note longer than 300 characters", () => {
    expect(
      discoveryAnswersSchema.safeParse({ ...answers, custom_idea: "x".repeat(301) }).success,
    ).toBe(false);
    expect(
      discoveryAnswersSchema.safeParse({ ...answers, custom_idea: "x".repeat(300) }).success,
    ).toBe(true);
  });

  it("asks for a shorter own-idea note instead of a vague error", () => {
    const result = discoveryAnswersSchema.safeParse({ ...answers, custom_idea: "x".repeat(301) });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(describeValidationIssues(result.error)).toContain("shorter");
  });

  it("names the field that went wrong", () => {
    const result = discoveryAnswersSchema.safeParse({ ...answers, class_status: "phd" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(describeValidationIssues(result.error)).toContain("class status");
  });
});

describe("AI reply validation", () => {
  it("keeps a well-formed reply", () => {
    expect(normalizeGeneratedProject(generated)).toMatchObject({
      title: "Balcony Garden Buddy",
      difficulty: "Beginner",
    });
  });

  it("trims and de-duplicates the roadmap", () => {
    const result = normalizeGeneratedProject({
      ...generated,
      roadmap: ["  Step one  ", "Step one", "Step two", "Step three", "Step four"],
    });
    expect(result.roadmap).toEqual(["Step one", "Step two", "Step three", "Step four"]);
  });

  it("drops extra future extensions instead of showing them", () => {
    const result = normalizeGeneratedProject({
      ...generated,
      future_extensions: [
        "Add a weather check",
        "Send a daily reminder",
        "Track two pots at once",
        "Log a month of readings",
        "Share a summary chart",
        "Add a watering timer",
        "Rename the plant",
      ],
    });
    expect(result.future_extensions).toHaveLength(5);
  });

  it("shortens an over-long technology name instead of rejecting the project", () => {
    const result = normalizeGeneratedProject({
      ...generated,
      technologies: [
        "Python",
        "TensorFlow Lite for microcontrollers and tiny boards",
        "Soil moisture sensing",
      ],
    });
    const second = result.technologies[1];
    expect(second).toBeDefined();
    expect(second?.length).toBeLessThanOrEqual(48);
    expect(second?.endsWith("…")).toBe(true);
  });

  it("shortens an over-long description instead of rejecting the project", () => {
    const result = normalizeGeneratedProject({ ...generated, description: "y".repeat(2200) });
    expect(result.description.length).toBeLessThanOrEqual(1800);
  });

  it("refuses a reply that is missing a field", () => {
    const { motivation: _motivation, ...incomplete } = generated;
    expect(() => normalizeGeneratedProject(incomplete)).toThrow(/motivation/);
  });

  it("refuses a reply that invented a career guarantee into the title", () => {
    expect(() => normalizeGeneratedProject({ ...generated, title: "x" })).toThrow(/title/);
  });

  it("refuses a reply with too few roadmap steps", () => {
    expect(() => normalizeGeneratedProject({ ...generated, roadmap: ["only one"] })).toThrow(
      /roadmap/,
    );
  });
});

describe("prompts", () => {
  it("asks for the student's interest, technology and level", () => {
    const prompt = userPrompt({ ...answers, interest: "robotics", technology: "iot" });
    expect(prompt).toContain("Robotics & innovation");
    expect(prompt).toContain("Smart devices & IoT");
    expect(prompt).toContain("Class 12");
  });

  it("asks for the student's own idea when they wrote one", () => {
    expect(userPrompt({ ...answers, custom_idea: "a bin that sorts itself" })).toContain(
      "a bin that sorts itself",
    );
  });

  it("asks for Hindi when Hindi is the preferred language", () => {
    expect(userPrompt({ ...answers, language: "hindi" })).toContain("Write every field in Hindi");
  });

  it("keeps the mentor rules the brief asked for", () => {
    const prompt = systemPrompt();
    expect(prompt).toContain("Do not invent qualifications, outcomes, or career guarantees.");
    expect(prompt).toContain("Avoid generic suggestions.");
  });
});

describe("failure copy", () => {
  it("tells a student to wait when the AI is busy", () => {
    expect(describeGenerationFailure("rate-limit")).toMatchObject({
      status: 429,
      message: expect.stringContaining("wait a moment"),
    });
  });

  it("never claims success when the project could not be saved", () => {
    expect(describeGenerationFailure("save").status).toBe(502);
    expect(describeGenerationFailure("save").message).toContain("no link to share");
  });

  it("says AI is off when the key is missing", () => {
    expect(describeGenerationFailure("config").status).toBe(500);
  });

  it("keeps an AI refusal at 403 instead of calling it a server problem", () => {
    expect(describeGenerationFailure("denied").status).toBe(403);
  });
});

describe("interactive demo choice", () => {
  it("shows the demo that fits the interest", () => {
    expect(demoThemeForInterest("gaming")).toBe("gaming");
    expect(demoThemeForInterest("robotics")).toBe("robotics");
    expect(demoThemeForInterest("creativity")).toBe("farming");
  });
});
