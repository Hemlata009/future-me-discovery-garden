import { describe, expect, it, vi } from "vitest";

vi.mock("@lovable.dev/vite-tanstack-config", () => ({
  defineConfig: (options: unknown) => options,
}));

import config from "../../vite.config";

describe("published browser connection configuration", () => {
  it("provides an HTTPS public Cloud address without exposing server credentials", () => {
    const options = config as unknown as {
      vite: { define: Record<string, string> };
    };
    const definitions = options.vite.define;
    const encodedUrl = definitions["import.meta.env.VITE_SUPABASE_URL"];
    if (!encodedUrl) throw new Error("Published browser Cloud URL is missing");
    const url = new URL(JSON.parse(encodedUrl));
    expect(url.protocol).toBe("https:");
    expect(url.hostname.endsWith(".lovable.cloud")).toBe(true);
    expect(Object.keys(definitions).sort()).toEqual([
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY",
      "import.meta.env.VITE_SUPABASE_URL",
    ]);
    const key = JSON.parse(definitions["import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY"]!);
    expect(key.startsWith("sb_publishable_")).toBe(true);
  });
});
