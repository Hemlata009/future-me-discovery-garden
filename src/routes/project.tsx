import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, RotateCcw, Sparkles } from "lucide-react";
import { z } from "zod";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { ProjectDemo } from "@/components/project-demo";
import { ProjectActions } from "@/components/project-actions";
import { getProject, pageHead } from "@/lib/projects";

export const Route = createFileRoute("/project")({
  validateSearch: z.object({
    theme: z.string().optional(),
    tech: z.string().optional(),
    idea: z.string().optional(),
    status: z.string().optional(),
    language: z.string().optional(),
    source: z.string().optional(),
  }),
  head: ({ match }) =>
    pageHead(getProject(match.search.theme).title, getProject(match.search.theme).description),
  component: ProjectPage,
});
function ProjectPage() {
  const search = Route.useSearch();
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
