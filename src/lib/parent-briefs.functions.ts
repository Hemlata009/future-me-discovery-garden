import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  parentBriefContentSchema,
  parentLanguageSchema,
  type ParentBriefContent,
  type ParentLanguage,
} from "@/lib/parent-experience";

export type ParentBrief = {
  id: string;
  project_id: string;
  project_title: string;
  language: ParentLanguage;
  created_at: string;
  content: ParentBriefContent;
};

/** Public by link, but read only through this server-side, single-id lookup. */
export const getParentBrief = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data }): Promise<ParentBrief | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: brief, error } = await supabaseAdmin
      .from("parent_briefs")
      .select("id, generated_project_id, language, content, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !brief) return null;
    const { data: project } = await supabaseAdmin
      .from("generated_projects")
      .select("generated_content")
      .eq("id", brief.generated_project_id)
      .maybeSingle();
    const content = parentBriefContentSchema.safeParse(brief.content);
    const language = parentLanguageSchema.safeParse(brief.language);
    if (!content.success || !language.success) return null;
    const title = (project?.generated_content as { title?: unknown } | undefined)?.title;
    return {
      id: brief.id,
      project_id: brief.generated_project_id,
      project_title: typeof title === "string" ? title : "Your child's FutureMe Family project",
      language: language.data,
      created_at: brief.created_at,
      content: content.data,
    };
  });
