import { z } from "zod";

import { hasProhibitedOutcomeFigure, niatFacts, type NiatFact } from "@/lib/niat-facts";
import {
  generatedProjectContentSchema,
  languageName,
  type GeneratedProjectContent,
  type JsonSchemaOutputFormat,
} from "@/lib/project-generation";

export const parentLanguageSchema = z.enum(["english", "hindi", "telugu"]);
export type ParentLanguage = z.infer<typeof parentLanguageSchema>;

export const parentBriefRequestSchema = z
  .object({ project_id: z.string().uuid(), language: parentLanguageSchema })
  .strict();

export const parentQuestionRequestSchema = z
  .object({ brief_id: z.string().uuid(), question: z.string().trim().min(2).max(300) })
  .strict();

export const indianMobileSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number.");

export const counsellorRequestSchema = z
  .object({
    generated_project_id: z.string().uuid(),
    parent_brief_id: z.string().uuid().optional(),
    contact_name: z.string().trim().min(2).max(80),
    phone: indianMobileSchema,
    who: z.enum(["student", "parent"]),
    language: parentLanguageSchema,
    consent: z.literal(true, { errorMap: () => ({ message: "Consent is required." }) }),
  })
  .strict();

const guardedText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((text) => !hasProhibitedOutcomeFigure(text), "Outcome figures are not allowed.");

export const parentBriefModelSchema = z.object({
  headline: z.string(),
  what_your_child_explored: z.string(),
  project_summary: z.string(),
  why_this_fits: z.string(),
  what_niat_is_and_is_not: z.string(),
  questions_to_ask_a_counsellor: z.array(z.string()),
});

export const parentBriefContentSchema = parentBriefModelSchema.extend({
  headline: guardedText(4, 120),
  what_your_child_explored: guardedText(12, 1000),
  project_summary: guardedText(12, 1400),
  why_this_fits: guardedText(12, 1000),
  what_niat_is_and_is_not: guardedText(24, 1600),
  questions_to_ask_a_counsellor: z.array(guardedText(4, 240)).min(3).max(5),
});
export type ParentBriefContent = z.infer<typeof parentBriefContentSchema>;

export const parentAnswerSchema = z.object({
  answer: guardedText(2, 1200).refine(
    (text) =>
      !/\b(?:guarantee[ds]?|assure[ds]?)\s+(?:a\s+)?(?:job|internship|placement|admission|scholarship)\b/i.test(
        text,
      ),
    "Outcome promises are not allowed.",
  ),
});
export type ParentAnswer = z.infer<typeof parentAnswerSchema>;

export const parentBriefOutputFormat: JsonSchemaOutputFormat = {
  type: "json_schema",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "headline",
      "what_your_child_explored",
      "project_summary",
      "why_this_fits",
      "what_niat_is_and_is_not",
      "questions_to_ask_a_counsellor",
    ],
    properties: {
      headline: { type: "string", minLength: 4, maxLength: 120 },
      what_your_child_explored: { type: "string", minLength: 12, maxLength: 1000 },
      project_summary: { type: "string", minLength: 12, maxLength: 1400 },
      why_this_fits: { type: "string", minLength: 12, maxLength: 1000 },
      what_niat_is_and_is_not: { type: "string", minLength: 24, maxLength: 1600 },
      questions_to_ask_a_counsellor: {
        type: "array",
        items: { type: "string", minLength: 4, maxLength: 240 },
        minItems: 1,
      },
    },
  },
};

export const parentAnswerOutputFormat: JsonSchemaOutputFormat = {
  type: "json_schema",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["answer"],
    properties: { answer: { type: "string", minLength: 2, maxLength: 1200 } },
  },
};

export type SavedProjectForParentPrompt = {
  interest: string;
  technology: string;
  project_type: string;
  class_status: string;
  custom_idea: string | null;
  generated_content: GeneratedProjectContent;
};

export function parentBriefSystemPrompt(language: ParentLanguage): string {
  return [
    "You write calm, factual briefs that help a student's parent understand their technology exploration.",
    `Write every field in ${languageName(language)}${language === "english" ? "" : " using native script"}.`,
    "Use only the saved project and the supplied NIAT fact sheet as sources. Do not use outside knowledge.",
    "Never state or imply salary, placement, scholarship, internship, job or admission guarantees.",
    "Never invent statistics or add numeric outcome figures.",
    "State clearly that the B.Tech degree is awarded by the partner university, not NIAT.",
    "NIAT is an upskilling initiative by NxtWave, not a university or degree-awarding body.",
    "If something is not supported by the supplied facts, say to ask a NIAT counsellor.",
    "Return exactly the requested structured fields and three to five useful counsellor questions.",
  ].join("\n");
}

export function parentBriefUserPrompt(
  project: SavedProjectForParentPrompt,
  facts: NiatFact[] = niatFacts,
): string {
  return JSON.stringify({ saved_project: project, niat_facts: facts });
}

export function parentQuestionSystemPrompt(language: ParentLanguage): string {
  return [
    "Answer a parent's question using only the supplied parent brief and NIAT fact sheet.",
    `Write in ${languageName(language)}${language === "english" ? "" : " using native script"}.`,
    "Do not use outside knowledge or invent details, statistics or promises.",
    "Refuse every job, internship, placement, salary, scholarship or admission outcome promise.",
    "Clearly attribute the B.Tech degree to the partner university whenever degree questions arise.",
    'If the answer is not explicitly supported by the supplied material, answer exactly: "Please ask a NIAT counsellor".',
    "Return only the structured answer field.",
  ].join("\n");
}

export function parentQuestionUserPrompt(
  brief: ParentBriefContent,
  question: string,
  facts: NiatFact[] = niatFacts,
): string {
  return JSON.stringify({ parent_brief: brief, niat_facts: facts, parent_question: question });
}

export function parseParentBriefContent(value: unknown): ParentBriefContent {
  return parentBriefContentSchema.parse(value);
}

export function parseStoredProjectContent(value: unknown): GeneratedProjectContent {
  return generatedProjectContentSchema.parse(value);
}
