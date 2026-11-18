// Browser-safe sign-up rules shared by the form and the server route.
import { z } from "zod";

import { indianMobileSchema } from "@/lib/parent-experience";

export const STUDENT_SIGNUP_ENDPOINT = "/api/student-signup";
export const INVITE_VISIT_ENDPOINT = "/api/invite-visit";

const journeyEntry = z
  .object({
    path: z
      .string()
      .max(200)
      .regex(/^\/[A-Za-z0-9/_-]*$/),
    seconds: z.number().int().min(0).max(3600),
    at: z.string().datetime(),
  })
  .strict();

export const studentSignupSchema = z
  .object({
    full_name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().max(120),
    password: z.string().min(8).max(72),
    phone: indianMobileSchema,
    class_status: z.enum(["class12", "completed", "other"]),
    city: z.union([z.string().trim().min(2).max(60), z.literal("")]),
    language: z.enum(["english", "hindi", "telugu"]),
    consent: z.literal(true, { errorMap: () => ({ message: "Consent is required." }) }),
    journey: z.array(journeyEntry).max(150),
    prompts: z.number().int().min(0).max(10),
    invite: z
      .object({
        code: z.string().regex(/^[A-Za-z0-9]{8,16}$/),
        kind: z.enum(["parent", "friend"]),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type StudentSignup = z.infer<typeof studentSignupSchema>;

export const inviteVisitSchema = z
  .object({
    code: z.string().regex(/^[A-Za-z0-9]{8,16}$/),
    kind: z.enum(["parent", "friend"]),
  })
  .strict();

export const CLASS_OPTIONS = [
  { value: "class12", label: "I'm in Class 12" },
  { value: "completed", label: "I've completed Class 12" },
  { value: "other", label: "Other / exploring early" },
] as const;

export function inviteLink(origin: string, code: string, kind: "parent" | "friend"): string {
  const url = new URL("/", origin);
  url.searchParams.set("invite", code);
  url.searchParams.set("for", kind);
  return url.toString();
}
