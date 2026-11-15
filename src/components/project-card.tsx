import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Bot, Gamepad2, Leaf } from "lucide-react";
import type { Project } from "@/lib/projects";

export function ProjectCard({
  project,
  showcase = false,
}: {
  project: Project;
  showcase?: boolean;
}) {
  const Icon = project.id === "farming" ? Leaf : project.id === "gaming" ? Gamepad2 : Bot;
  return (
    <Link
      to="/project"
      search={{ theme: project.id }}
      className={`project-card tone-${project.tone}`}
    >
      <div className="project-image">
        <img src={project.image} alt={project.title} width={1024} height={768} loading="lazy" />
        <span className="image-label">
          <Icon size={13} />
          {showcase ? "Student concept" : "Beginner friendly"}
        </span>
        <span className="project-arrow">
          <ArrowUpRight size={19} />
        </span>
      </div>
      <div className="project-card-body">
        <p className="project-category">
          <Icon size={14} />
          {project.category}
        </p>
        <h3>{project.title}</h3>
        <p className="project-description">{project.description}</p>
        <div className="technology-tags">
          {project.technologies.slice(0, 2).map((tech) => (
            <span key={tech}>{tech}</span>
          ))}
          <span className="tag-extra">+1</span>
        </div>
        {showcase && (
          <div className="project-author">
            <span className="avatar">{project.initials}</span>
            <span>
              {project.author}
              <small>Class 12 · Sample project</small>
            </span>
            <ArrowUpRight size={17} />
          </div>
        )}
      </div>
    </Link>
  );
}
