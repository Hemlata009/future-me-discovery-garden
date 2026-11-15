import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import {
  generatedProjectContentSchema,
  type GeneratedProjectContent,
} from "@/lib/project-generation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GeneratedProject = {
  id: string;
  interest: string;
  technology: string;
  project_type: string;
  class_status: string;
  language: string;
  custom_idea: string | null;
  created_at: string;
  content: GeneratedProjectContent;
};

/**
 * Public read of one generated project so a shared link opens the same project.
 * Uses the publishable key, so row-level security still decides what is visible.
 */
export const getGeneratedProject = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<GeneratedProject | null> => {
    if (!UUID.test(data.id)) return null;

    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const url = process.env["SUPABASE_URL"];
    if (!key || !url) return null;

    const supabasePublic = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      // Opaque sb_ keys are not JWTs: send only apikey, never a bearer token.
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const { data: row, error } = await supabasePublic
      .from("generated_projects")
      .select(
        "id, interest, technology, project_type, class_status, language, custom_idea, created_at, generated_content",
      )
      .eq("id", data.id)
      .maybeSingle();

    if (error || !row) return null;

    const content = generatedProjectContentSchema.safeParse(row.generated_content);
    if (!content.success) return null;

    return {
      id: row.id,
      interest: row.interest,
      technology: row.technology,
      project_type: row.project_type,
      class_status: row.class_status,
      language: row.language,
      custom_idea: row.custom_idea,
      created_at: row.created_at,
      content: content.data,
    };
  });
