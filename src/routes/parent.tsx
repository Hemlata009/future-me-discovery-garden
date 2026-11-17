import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ParentBriefPageView } from "@/components/parent-brief-page";
import { getParentBrief, type ParentBrief } from "@/lib/parent-briefs.functions";
import { pageHead } from "@/lib/projects";

export const Route = createFileRoute("/parent")({
  validateSearch: z.object({
    id: z.string().uuid().optional(),
    ref: z.string().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ deps }) => {
    if (!deps.id) return null;
    try {
      return await getParentBrief({ data: { id: deps.id } });
    } catch {
      return null;
    }
  },
  head: ({ match }) => {
    const brief = match.loaderData as ParentBrief | null;
    const base = brief
      ? pageHead(
          brief.content.headline,
          `A grounded FutureMe AI Parent Brief about ${brief.project_title}.`,
        )
      : pageHead(
          "Parent Brief unavailable",
          "Open a valid FutureMe AI Parent Brief link or create a new brief from a generated project.",
        );
    return { meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }] };
  },
  component: ParentPage,
});

function ParentPage() {
  const brief = Route.useLoaderData();
  const { ref } = Route.useSearch();
  return <ParentBriefPageView brief={brief} referralCode={ref} />;
}
