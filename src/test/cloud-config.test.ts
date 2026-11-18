import { describe, expect, it } from "vitest";
import { missingCloudSettings } from "@/lib/cloud-config";

describe("missing Cloud configuration detection", () => {
  it("names the missing browser key", () => {
    const e = new Error(
      "Missing Supabase environment variable(s): SUPABASE_PUBLISHABLE_KEY. Connect Supabase in Lovable Cloud.",
    );
    expect(missingCloudSettings(e)).toEqual(["VITE_SUPABASE_PUBLISHABLE_KEY"]);
  });
  it("names both settings when both are missing", () => {
    const e = new Error(
      "Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY. Connect",
    );
    expect(missingCloudSettings(e)).toEqual(["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]);
  });
  it("ignores unrelated errors", () => {
    expect(missingCloudSettings(new Error("boom"))).toBeNull();
  });
});
