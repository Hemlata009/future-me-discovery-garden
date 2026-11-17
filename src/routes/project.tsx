import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { referralCodeSchema, track } from "@/lib/tracking";
import { ArrowDown, ArrowLeft, RotateCcw, Sparkles } from "lucide-react";
import { answerChips } from "@/lib/journey-copy";
import { z } from "zod";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { ProjectDemo } from "@/components/project-demo";
import { ProjectActions } from "@/components/project-actions";
import { ProjectDecisionCard } from "@/components/project-decision-card";
import { ReferredDiscoveryAction } from "@/components/referred-discovery-action";
import { getProject, pageHead } from "@/lib/projects";
import { getGeneratedProject, type GeneratedProject } from "@/lib/generated-projects.functions";
import {
  demoThemeForInterest,
  languageName,
  type GeneratedProjectContent,
} from "@/lib/project-generation";

export const Route = createFileRoute("/project")({
  validateSearch: z.object({
    id: z.string().optional(),
    theme: z.string().optional(),
    tech: z.string().optional(),
    idea: z.string().optional(),
    status: z.string().optional(),
    language: z.string().optional(),
    source: z.string().optional(),
    ref: z.string().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ deps }) => {
    if (!deps.id) return null;
    try {
      return await getGeneratedProject({ data: { id: deps.id } });
    } catch {
      return null;
    }
  },
  head: ({ match }) => {
    const generated = match.loaderData as GeneratedProject | null;
    if (generated) {
      const content = generated.content as GeneratedProjectContent;
      return pageHead(
        content.title,
        `${content.tagline} — an AI-generated beginner project from your discovery answers.`,
      );
    }
    const project = getProject(match.search.theme);
    return pageHead(project.title, project.description);
  },
  component: ProjectPage,
});

function ProjectPage() {
  const search = Route.useSearch();
  const generated = Route.useLoaderData();
  useEffect(() => {
    if (!generated) return;
    const ref = referralCodeSchema.safeParse(search.ref);
    // Referral first, so the visitor's first touch is credited to the share.
    void (async () => {
      if (ref.success) await track({ event: "referral_visit", ref: ref.data });
      await track({ event: "project_viewed", project_id: generated.id });
    })();
  }, [generated, search.ref]);
  if (search.id) return <GeneratedProjectView generated={generated} search={search} />;
  return <SampleProjectView search={search} />;
}

function GeneratedProjectView({
  generated,
  search,
}: {
  generated: GeneratedProject | null;
  search: ReturnType<typeof Route.useSearch>;
}) {
  if (!generated) {
    return (
      <SiteShell>
        <div className="page-width">
          <div className="page-intro">
            <p className="eyebrow">LINK NOT FOUND</p>
            <h1>We couldn't find that project.</h1>
            <p>
              The link may have expired, or the project was never saved. You can generate a fresh
              one in under a minute.
            </p>
            <div className="project-tools">
              <Button asChild variant="premium">
                <Link to="/discover">
                  <Sparkles />
                  Find my future
                </Link>
              </Button>
              <Button asChild variant="soft">
                <Link to="/projects">
                  <ArrowLeft />
                  All projects
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </SiteShell>
    );
  }

  const content = generated.content as GeneratedProjectContent;
  const theme = demoThemeForInterest(
    generated.interest as Parameters<typeof demoThemeForInterest>[0],
  );
  const cover = getProject(theme);

  return (
    <SiteShell>
      <div className="page-width">
        <div className="mt-8">
          <Link to="/projects" className="text-link">
            <ArrowLeft size={14} />
            All projects
          </Link>
        </div>
        {search.ref && (
          <div className="project-tools">
            <ReferredDiscoveryAction
              referralCode={search.ref}
              utmSource={search.utm_source}
              utmMedium={search.utm_medium}
              utmCampaign={search.utm_campaign}
            />
          </div>
        )}
        <div className="project-header">
          <div className="project-header-copy">
            <span className="hero-pill">
              <Sparkles size={13} />
              YOUR DISCOVERY · AI-GENERATED PROJECT
            </span>
            <ul className="answer-chips" aria-label="Your answers">
              {answerChips(generated).map((chip) => (
                <li key={chip.label}>
                  <span>{chip.label}</span> {chip.value}
                </li>
              ))}
            </ul>
            <h1>{content.title}</h1>
            <div className="fit-callout">
              <strong>Why this fits you</strong>
              <p>{content.interest_connection}</p>
            </div>
            <p>{content.tagline}</p>
            <div className="technology-tags">
              {content.technologies.map((tech) => (
                <span key={tech}>{tech}</span>
              ))}
              <span>{content.difficulty}</span>
            </div>
            <p className="mt-4">{content.description}</p>
            {generated.language !== "english" && (
              <p className="text-xs mt-2">
                Written in {languageName(generated.language as "hindi" | "telugu")} because that's
                what you chose.
              </p>
            )}
            <div className="project-tools">
              <Button asChild variant="premium">
                <a href="#try-demo">
                  <ArrowDown /> Try the interactive demo
                </a>
              </Button>
              {!search.ref && (
                <Link to="/discover" className="text-link">
                  <RotateCcw size={14} />
                  Generate another project
                </Link>
              )}
            </div>
          </div>
          <img
            className="project-cover"
            src={cover.image}
            alt={content.title}
            width={1024}
            height={768}
          />
        </div>

        <div className="result-layout project-exploration-layout">
          <section>
            <p className="eyebrow">THE PROBLEM IT SOLVES</p>
            <h2>Worth fixing in the real world.</h2>
            <p className="section-description">{content.problem}</p>
          </section>
          <div id="try-demo" className="demo-anchor">
            <ProjectDemo key={theme} theme={theme} />
          </div>
        </div>

        <ProjectDecisionCard
          projectId={generated.id}
          language={generated.language as "english" | "hindi" | "telugu"}
        />

        <section className="project-roadmap">
          <p className="eyebrow">MAKE IT HAPPEN, ONE STEP AT A TIME</p>
          <h2>Your build roadmap.</h2>
          <ol className="roadmap-list">
            {content.roadmap.map((step, index) => (
              <li key={step}>
                <span className="step-icon">0{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="result-layout">
          <div className="demo-panel">
            <div className="demo-top">
              <h2>Build this today.</h2>
              <span className="demo-badge">First milestone</span>
            </div>
            <p>{content.first_milestone}</p>
          </div>
          <div className="demo-panel">
            <div className="demo-top">
              <h2>When you're ready for more.</h2>
              <span className="demo-badge">Next levels</span>
            </div>
            <div className="technology-tags">
              {content.future_extensions.map((extension) => (
                <span key={extension}>{extension}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="result-layout">
          <section>
            <p className="eyebrow">WHERE THIS COULD TAKE YOU</p>
            <h2>A look at the work behind it.</h2>
            <p className="section-description">{content.career_connection}</p>
          </section>
          <section>
            <p className="eyebrow">A NOTE FOR YOU</p>
            <h2>Start small, start today.</h2>
            <p className="section-description">{content.motivation}</p>
          </section>
        </div>

        <p className="wizard-note">
          AI-generated from your discovery answers · The interactive sample above is a rule-based
          simulation, not AI
        </p>
      </div>
    </SiteShell>
  );
}

function SampleProjectView({ search }: { search: ReturnType<typeof Route.useSearch> }) {
  const project = getProject(search.theme);
  const custom = search.idea && !["assistant", "experience", "solution"].includes(search.idea);
  return (
    <SiteShell>
      <div className="page-width">
        <div className="mt-8">
          <Link to="/projects" className="text-link">
            <ArrowLeft size={14} />
            All projects
          </Link>
        </div>
        <div className="project-header">
          <div className="project-header-copy">
            <span className="hero-pill">
              <Sparkles size={13} />
              {search.source === "discovery"
                ? "YOUR DISCOVERY · SAMPLE PROJECT"
                : "A LITTLE CURIOSITY, MADE REAL · SAMPLE PROJECT"}
            </span>
            <h1>{project.title}</h1>
            <p>{project.description}</p>
            <div className="technology-tags">
              {project.technologies.map((tech) => (
                <span key={tech}>{tech}</span>
              ))}
              {search.tech && (
                <span>
                  Interest:{" "}
                  {search.tech === "ai" ? "AI" : search.tech === "web" ? "Web development" : "IoT"}
                </span>
              )}
            </div>
            {custom && <p>Your inspiration: “{search.idea}”</p>}
            {search.language && search.language !== "english" && (
              <p className="text-xs">
                Preferred language: {search.language === "hindi" ? "Hindi" : "Telugu"} · This sample
                is in English.
              </p>
            )}
            <div className="project-tools">
              <ProjectActions title={project.title} />
              <Button asChild variant="soft">
                <Link to="/discover">
                  <RotateCcw />
                  Generate Another
                </Link>
              </Button>
            </div>
          </div>
          <img
            className="project-cover"
            src={project.image}
            alt={project.title}
            width={1024}
            height={768}
          />
        </div>
        <div className="result-layout">
          <section>
            <p className="eyebrow">MAKE IT HAPPEN, ONE STEP AT A TIME</p>
            <h2>Your build roadmap.</h2>
            <ol className="roadmap-list">
              {project.roadmap.map((step, index) => (
                <li key={step}>
                  <span className="step-icon">0{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="section-description">{project.goal}</p>
          </section>
          <ProjectDemo key={project.id} theme={project.id} />
        </div>
      </div>
    </SiteShell>
  );
}
