/** Browser-safe copy and rules for the explore-before-you-apply journey. */

export const homePromise = "Five questions. Five minutes. Your own tech project.";

export const inviteValueCopy =
  "Explore together. Your friend gets their own 5-minute project, you can compare ideas.";

const INTEREST: Record<string, string> = {
  farming: "Nature & sustainability",
  gaming: "Gaming & entertainment",
  robotics: "Robotics & innovation",
  creativity: "Art & creativity",
  science: "Science & discovery",
  community: "People & community",
};
const TECH: Record<string, string> = {
  ai: "Artificial intelligence",
  web: "Web development",
  iot: "Smart devices & IoT",
};
const BUILD: Record<string, string> = {
  assistant: "A helpful assistant",
  experience: "An interactive experience",
  solution: "A real-world solution",
  custom: "My own idea",
};
const LANGUAGE: Record<string, string> = {
  english: "English",
  hindi: "हिन्दी · Hindi",
  telugu: "తెలుగు · Telugu",
};

/** The student's own answers, in the order they gave them, as labelled chips. */
export function answerChips(answers: {
  interest: string;
  technology: string;
  project_type: string;
  language: string;
}): { label: string; value: string }[] {
  return [
    { label: "Interest", value: INTEREST[answers.interest] ?? answers.interest },
    { label: "Technology", value: TECH[answers.technology] ?? answers.technology },
    { label: "Build", value: BUILD[answers.project_type] ?? answers.project_type },
    { label: "Language", value: LANGUAGE[answers.language] ?? answers.language },
  ];
}

export type GenerationErrorType = "rate-limit" | "invalid" | "unavailable" | "answers";

/** Groups server failure codes into the three reasons a student can act on. */
export function generationErrorType(code: string | undefined): GenerationErrorType {
  if (code === "rate-limit") return "rate-limit";
  if (code === "validation") return "answers";
  if (code === "no-object") return "invalid";
  return "unavailable";
}

export const generationErrorTitle: Record<GenerationErrorType, string> = {
  "rate-limit": "You've reached the limit for now.",
  invalid: "The AI's reply didn't make a usable project.",
  unavailable: "The AI is unavailable right now.",
  answers: "Some answers need another look.",
};

/** True when a grounded answer defers to a counsellor instead of answering. */
export function isCounsellorFallback(answer: string): boolean {
  return /please ask a niat counsellor/i.test(answer.trim()) && answer.trim().length < 80;
}
