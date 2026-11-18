// Browser-safe rules for the student's saved pre-application details.
// This is NOT a NIAT application: it only helps the student copy their own
// details into the official portal by hand. Nothing is sent to NIAT.
import { z } from "zod";

import { indianMobileSchema } from "@/lib/parent-experience";

export const APPLICATION_PROFILE_ENDPOINT = "/api/application-profile";

export const qualificationOptions = [
  { value: "class12_studying", label: "Currently in Class 12" },
  { value: "class12_completed", label: "Completed Class 12" },
  { value: "diploma", label: "Diploma" },
  { value: "other", label: "Other" },
] as const;

/** Only the course named in the verified NIAT fact sheet, plus an honest "not sure". */
export const courseOptions = [
  { value: "btech_partner_university", label: "B.Tech (through a NIAT partner university)" },
  { value: "not_sure", label: "Not sure yet, I'll ask a counsellor" },
] as const;

type OptionValue<T extends readonly { value: string }[]> = T[number]["value"];
const values = <T extends readonly { value: string }[]>(options: T) =>
  options.map((option) => option.value) as [OptionValue<T>, ...OptionValue<T>[]];

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

/** Fields the student fills in. No ID documents, marks, income or payment data. */
export const applicationProfileFieldsSchema = z
  .object({
    student_name: text(2, 80),
    student_phone: indianMobileSchema,
    email: z.union([z.string().trim().email().max(120), z.literal("")]),
    city: text(2, 60),
    state: text(2, 60),
    qualification: z.enum(values(qualificationOptions)),
    passing_year: z.union([
      z.string().regex(/^20[2-3]\d$/, "Enter a year such as 2026."),
      z.literal(""),
    ]),
    intended_course: z.enum(values(courseOptions)),
  })
  .strict();

export type ApplicationProfileFields = z.infer<typeof applicationProfileFieldsSchema>;

export const saveApplicationProfileSchema = applicationProfileFieldsSchema
  .extend({
    generated_project_id: z.string().uuid().optional(),
    consent: z.literal(true, { errorMap: () => ({ message: "Consent is required." }) }),
  })
  .strict();

export type SavedApplicationProfile = ApplicationProfileFields & { updated_at: string };

export const emptyApplicationProfile: ApplicationProfileFields = {
  student_name: "",
  student_phone: "",
  email: "",
  city: "",
  state: "",
  qualification: "class12_studying",
  passing_year: "",
  intended_course: "btech_partner_university",
};

/** Maps the student's own discovery answer onto the form; never uses a parent's contact data. */
export function qualificationFromClassStatus(
  classStatus: string | undefined,
): ApplicationProfileFields["qualification"] {
  if (classStatus === "class12") return "class12_studying";
  if (classStatus === "completed") return "class12_completed";
  return "class12_studying";
}

const labelOf = (options: readonly { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

/** Plain-text summary for copying or downloading into the official portal by hand. */
export function applicationProfileText(profile: ApplicationProfileFields): string {
  const lines: [string, string][] = [
    ["Student name", profile.student_name],
    ["Student mobile", profile.student_phone],
    ["Email", profile.email || "—"],
    ["City", profile.city],
    ["State", profile.state],
    ["Current qualification", labelOf(qualificationOptions, profile.qualification)],
    ["Year of passing", profile.passing_year || "—"],
    ["Intended course", labelOf(courseOptions, profile.intended_course)],
  ];
  return [
    "FutureMe Family: saved pre-application details (not a NIAT application)",
    ...lines.map(([label, value]) => `${label}: ${value}`),
    "Enter these yourself on https://apply.niatindia.com/",
  ].join("\n");
}
