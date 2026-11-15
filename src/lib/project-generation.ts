import { z } from "zod";

/**
 * Browser-safe rules for AI project generation: the shapes we accept from the
 * wizard, the shape we demand back from the AI, and the copy shown when a
 * generation fails. No secrets, no database, no server-only imports here.
 */

export const discoveryAnswersSchema = z.object({
  interest: z.enum(["farming", "gaming", "robotics", "creativity", "science", "community"]),
  technology: z.enum(["ai", "web", "iot"]),
  project_type: z.enum(["assistant", "experience", "solution", "custom"]),
  class_status: z.enum(["class12", "completed", "other"]),
  language: z.enum(["english", "hindi", "telugu"]),
  custom_idea: z.string().trim().max(300).optional(),
});

export type DiscoveryAnswers = z.infer<typeof discoveryAnswersSchema>;

/** Flat schema handed to the AI: every field required, no length bounds. */
export const generatedProjectModelSchema = z.object({
  title: z.string(),
  tagline: z.string(),
  interest_connection: z.string(),
  problem: z.string(),
  description: z.string(),
  difficulty: z.enum(["Beginner", "Intermediate", "Advanced"]),
  technologies: z.array(z.string()),
  roadmap: z.array(z.string()),
  first_milestone: z.string(),
  future_extensions: z.array(z.string()),
  career_connection: z.string(),
  motivation: z.string(),
});

/** Local guard-rail check on whatever the AI returns. */
export const generatedProjectContentSchema = generatedProjectModelSchema.extend({
  title: z.string().min(3).max(90),
  tagline: z.string().min(4).max(160),
  interest_connection: z.string().min(12).max(700),
  problem: z.string().min(12).max(700),
  description: z.string().min(24).max(1800),
  technologies: z.array(z.string().min(1).max(48)).min(2).max(6),
  roadmap: z.array(z.string().min(3).max(200)).min(3).max(7),
  first_milestone: z.string().min(12).max(500),
  future_extensions: z.array(z.string().min(3).max(240)).min(2).max(5),
  career_connection: z.string().min(6).max(400),
  motivation: z.string().min(12).max(600),
});

export type GeneratedProjectContent = z.infer<typeof generatedProjectContentSchema>;

const LABELS: Record<keyof DiscoveryAnswers, string> = {
  interest: "interest",
  technology: "technology",
  project_type: "kind of build",
  class_status: "class status",
  language: "language",
  custom_idea: "your own idea",
};

const INTEREST_NAMES: Record<DiscoveryAnswers["interest"], string> = {
  farming: "Nature & sustainability",
  gaming: "Gaming & entertainment",
  robotics: "Robotics & innovation",
  creativity: "Art & creativity",
  science: "Science & discovery",
  community: "People & community",
};

const TECHNOLOGY_NAMES: Record<DiscoveryAnswers["technology"], string> = {
  ai: "Artificial intelligence",
  web: "Web development",
  iot: "Smart devices & IoT",
};

const PROJECT_TYPE_NAMES: Record<DiscoveryAnswers["project_type"], string> = {
  assistant: "a helpful assistant",
  experience: "an interactive experience",
  solution: "a real-world solution",
  custom: "their own custom idea",
};

const STATUS_NAMES: Record<DiscoveryAnswers["class_status"], string> = {
  class12: "currently in Class 12",
  completed: "has completed Class 12",
  other: "exploring technology early",
};

const LANGUAGE_NAMES: Record<DiscoveryAnswers["language"], string> = {
  english: "English",
  hindi: "Hindi",
  telugu: "Telugu",
};

export function languageName(language: DiscoveryAnswers["language"]): string {
  return LANGUAGE_NAMES[language];
}

/** Which bundled interactive demo fits a generated project. */
export function demoThemeForInterest(interest: DiscoveryAnswers["interest"]): string {
  if (interest === "gaming") return "gaming";
  if (interest === "robotics") return "robotics";
  return "farming";
}

export function systemPrompt(): string {
  return [
    "Act as an expert technology mentor who helps Class 12 students discover exciting",
    "beginner-friendly technology projects.",
    "",
    "Your goal is to convert a student's personal interests into a practical project they",
    "can start building.",
    "",
    "Requirements:",
    "- Understand the student's chosen interest.",
    "- Connect it to a meaningful real-world problem.",
    "- Suggest an original and practical technology project.",
    "- Adapt complexity to the student's educational level.",
    "- Respect their preferred language.",
    "- Explain technical concepts in beginner-friendly language.",
    "- Give actionable build steps.",
    "- Avoid generic suggestions.",
    "- Do not invent qualifications, outcomes, or career guarantees.",
    "",
    "Output rules:",
    "- Return exactly the requested fields, and nothing else.",
    "- roadmap: 4 to 6 short build steps, in order, each one a single action a student can do.",
    "- future_extensions: 2 to 3 improvements they could add later.",
    "- technologies: 3 to 5 short names, two to four words each, that a beginner can look up.",
    "- Keep every sentence free of invented statistics, certificates, or job guarantees.",
  ].join("\n");
}

export function userPrompt(answers: DiscoveryAnswers): string {
  const lines = [
    `Interest: ${INTEREST_NAMES[answers.interest]}`,
    `Technology they are curious about: ${TECHNOLOGY_NAMES[answers.technology]}`,
    `What they want to build: ${PROJECT_TYPE_NAMES[answers.project_type]}`,
    `Where they are: a student who ${STATUS_NAMES[answers.class_status]}`,
    `Preferred language: ${LANGUAGE_NAMES[answers.language]}`,
  ];
  if (answers.custom_idea) lines.push(`Their own idea: ${answers.custom_idea}`);

  const languageRule =
    answers.language === "english"
      ? "Write every field in English."
      : `Write every field in ${LANGUAGE_NAMES[answers.language]} (native script), keeping well-known technical names such as Python or sensor in English.`;

  return [
    "Design one beginner-friendly technology project for this student.",
    "",
    lines.join("\n"),
    "",
    languageRule,
    "",
    "Make it feel written for this one student: reference their interest and their idea, not a",
    "generic template.",
  ].join("\n");
}

/** Cuts over-long text at a sentence or word boundary instead of rejecting it. */
function truncate(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max - 1);
  const boundary = Math.max(
    head.lastIndexOf(" "),
    head.lastIndexOf("."),
    head.lastIndexOf("!"),
    head.lastIndexOf("?"),
  );
  const cut = boundary > max * 0.5 ? head.slice(0, boundary + 1) : head;
  return `${cut.trim()}…`;
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = truncate(value, max);
  return clean.length ? clean : undefined;
}

function cleanList(value: unknown, max: number, itemMax: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = truncate(item, itemMax);
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

type RawProject = {
  title?: unknown;
  tagline?: unknown;
  interest_connection?: unknown;
  problem?: unknown;
  description?: unknown;
  difficulty?: unknown;
  technologies?: unknown;
  roadmap?: unknown;
  first_milestone?: unknown;
  future_extensions?: unknown;
  career_connection?: unknown;
  motivation?: unknown;
};

/**
 * Trims, de-duplicates and clamps what the AI sent, then checks it against the
 * guard-rail schema. Throws a plain Error when the reply is unusable.
 */
export function normalizeGeneratedProject(value: unknown): GeneratedProjectContent {
  const raw = (value ?? {}) as RawProject;
  const candidate = {
    title: cleanText(raw.title, 90),
    tagline: cleanText(raw.tagline, 160),
    interest_connection: cleanText(raw.interest_connection, 700),
    problem: cleanText(raw.problem, 700),
    description: cleanText(raw.description, 1800),
    difficulty: raw.difficulty,
    technologies: cleanList(raw.technologies, 6, 48),
    roadmap: cleanList(raw.roadmap, 7, 200),
    first_milestone: cleanText(raw.first_milestone, 500),
    future_extensions: cleanList(raw.future_extensions, 5, 240),
    career_connection: cleanText(raw.career_connection, 400),
    motivation: cleanText(raw.motivation, 600),
  };

  const parsed = generatedProjectContentSchema.safeParse(candidate);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => (issue.path.length ? issue.path.join(".") : "project"))
      .join(", ");
    throw new Error(`The AI reply is missing or too short in: ${missing || "project"}.`);
  }
  return parsed.data;
}

export type GenerationFailureKind =
  | "validation"
  | "config"
  | "rate-limit"
  | "credits"
  | "denied"
  | "no-object"
  | "network"
  | "upstream"
  | "save";

export type GenerationFailure = { status: number; message: string };

const FAILURE_COPY: Record<GenerationFailureKind, GenerationFailure> = {
  validation: {
    status: 400,
    message: "Some of your answers didn't come through properly. Please check them and try again.",
  },
  config: {
    status: 500,
    message: "AI generation isn't switched on for this site yet. Please try again later.",
  },
  "rate-limit": {
    status: 429,
    message: "We're generating a lot of projects right now. Please wait a moment and try again.",
  },
  credits: {
    status: 503,
    message: "This site has run out of AI credits, so it can't generate a project just now.",
  },
  denied: {
    status: 403,
    message: "The AI service refused this request, so no project was generated. Please try again.",
  },
  "no-object": {
    status: 502,
    message: "The AI's answer didn't come back in the right shape. Please try generating again.",
  },
  network: {
    status: 503,
    message: "We couldn't reach the AI service. Check your connection and try again.",
  },
  upstream: {
    status: 502,
    message: "The AI service had trouble with that request. Please try generating again.",
  },
  save: {
    status: 502,
    message: "Your project was generated but couldn't be saved, so there's no link to share yet. Please try again.",
  },
};

export function describeGenerationFailure(kind: GenerationFailureKind): GenerationFailure {
  return FAILURE_COPY[kind];
}

/** Human-readable reason for a rejected wizard payload. */
export function describeValidationIssues(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return describeGenerationFailure("validation").message;
  const key = first.path[0] as keyof DiscoveryAnswers | undefined;
  if (key === "custom_idea") {
    return "Your own idea needs to be a little shorter — under 300 characters.";
  }
  const field = key ? LABELS[key] : undefined;
  if (field) return `Please choose a real ${field} before generating your project.`;
  return describeGenerationFailure("validation").message;
}
