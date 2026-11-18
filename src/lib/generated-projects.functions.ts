import { createServerFn } from "@tanstack/react-start";

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
 * Public read of exactly one generated project, so a shared link opens the same
 * project for anyone. The browser only ever sends a project id; the row is
 * fetched on the server with the service-role key, which is never shipped to
 * the browser. A id that isn't a real project id is refused before any query
 * runs, and only the one matching row is ever returned.
 */
export const getGeneratedProject = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<GeneratedProject | null> => {
    if (!UUID.test(data.id)) return null;

    // Loaded inside the handler: a top-level import would pull the service-role
    // client into the browser bundle.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
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
