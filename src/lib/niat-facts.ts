import { z } from "zod";

export const NIAT_SOURCE_URL = "https://www.niatindia.com/";
export const NIAT_FACTS_VERIFIED_ON = "2026-11-17";

export const niatFactSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    source_url: z.literal(NIAT_SOURCE_URL),
    verified_on: z.literal(NIAT_FACTS_VERIFIED_ON),
  })
  .strict();

export type NiatFact = z.infer<typeof niatFactSchema>;

/** The complete source of NIAT claims available to parent-facing AI features. */
export const niatFacts: NiatFact[] = [
  {
    id: "upskilling-not-university",
    text: "NIAT is an upskilling initiative by NxtWave; it is not a university or a degree-awarding body.",
    source_url: NIAT_SOURCE_URL,
    verified_on: NIAT_FACTS_VERIFIED_ON,
  },
  {
    id: "partner-university-degree",
    text: "The B.Tech degree is awarded by the partner university, which handles admissions, exams and degree requirements. NIAT awards its own Industry-ready Certification.",
    source_url: NIAT_SOURCE_URL,
    verified_on: NIAT_FACTS_VERIFIED_ON,
  },
  {
    id: "year-one-topics",
    text: "Year 1 topics include AI essentials, no-code automation, Python, and foundations such as DSA and DBMS.",
    source_url: NIAT_SOURCE_URL,
    verified_on: NIAT_FACTS_VERIFIED_ON,
  },
  {
    id: "admission-steps",
    text: "Admission steps: applicants take the NxtWave Assessment Test (NAT), followed by counselling. Official details are with the counsellor.",
    source_url: NIAT_SOURCE_URL,
    verified_on: NIAT_FACTS_VERIFIED_ON,
  },
  {
    id: "outcome-scope",
    text: "Published outcome figures cover multiple NxtWave programmes, not only NIAT.",
    source_url: NIAT_SOURCE_URL,
    verified_on: NIAT_FACTS_VERIFIED_ON,
  },
  {
    id: "no-job-assurance",
    text: "Enrollment in NIAT does not assure a job or internship.",
    source_url: NIAT_SOURCE_URL,
    verified_on: NIAT_FACTS_VERIFIED_ON,
  },
  {
    id: "fees-eligibility-counsellor",
    text: "Fees and eligibility are not listed here: ask a NIAT counsellor.",
    source_url: NIAT_SOURCE_URL,
    verified_on: NIAT_FACTS_VERIFIED_ON,
  },
];

/** Rejects numeric outcome claims such as a salary package or a large monetary total. */
export function hasProhibitedOutcomeFigure(text: string): boolean {
  return /\b\d[\d,.]*\s*(?:lpa|lakh|crore)\b/i.test(text);
}

/** A build-time/testable guard for the hand-maintained fact sheet. */
export function assertNiatFactsSafe(facts: NiatFact[] = niatFacts): true {
  if (facts.length !== 7) throw new Error("The NIAT fact sheet must contain exactly seven facts.");
  for (const fact of facts) {
    niatFactSchema.parse(fact);
    if (hasProhibitedOutcomeFigure(fact.text)) {
      throw new Error(`NIAT fact ${fact.id} contains a prohibited outcome figure.`);
    }
  }
  return true;
}

assertNiatFactsSafe();
