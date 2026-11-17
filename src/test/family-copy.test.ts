import { describe, expect, it } from "vitest";
import { honestyNote, parentShareMessage } from "@/lib/family-copy";

describe("family copy", () => {
  it("uses the exact English honesty note", () => {
    expect(honestyNote.english).toBe(
      "A student-built concept. Not an official NIAT page. Confirm all details with a NIAT counsellor.",
    );
  });
  it("writes the share text as the student, with the link and no official NIAT voice", () => {
    for (const lang of ["english", "hindi", "telugu"] as const) {
      const text = parentShareMessage(lang, "https://x.test/parent?id=1");
      expect(text.endsWith("https://x.test/parent?id=1")).toBe(true);
      expect(text).not.toMatch(/NIAT/);
    }
    expect(parentShareMessage("english", "L")).toBe(
      "I explored what I could build in tech. Please read this one-page brief: L",
    );
  });
});
