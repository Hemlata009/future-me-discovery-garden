import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock3,
  Compass,
  PhoneCall,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { courseOptions, qualificationOptions } from "@/lib/application-profile";
import { formatDuration } from "@/lib/counsellor-metrics";
import type { StudentHome } from "@/lib/student-home.server";

type Ok = Extract<StudentHome, { access: "ok" }>;

const STEPS: { key: keyof Ok["steps"]; label: string }[] = [
  { key: "discovery", label: "Completed discovery" },
  { key: "project", label: "Got an AI project" },
  { key: "demo", label: "Tried the demo" },
  { key: "brief", label: "Made a Parent Brief" },
  { key: "brief_shared", label: "Shared it with family" },
  { key: "counsellor", label: "Asked for a counsellor" },
  { key: "application", label: "Opened the application" },
];

const REQUEST_LABELS: Record<string, string> = {
  new: "Request received. A counsellor will be assigned soon.",
  assigned: "A counsellor has been assigned to you.",
  contacted: "A counsellor has spoken with you.",
  follow_up: "A follow-up call is planned.",
  qualified: "You're ready for the next steps with your counsellor.",
  not_interested: "This request is closed.",
  closed: "This request is closed.",
};

const day = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
const label = (options: readonly { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;
const cap = (value: string) =>
  value.length <= 3 ? value.toUpperCase() : value[0]!.toUpperCase() + value.slice(1);

export function StudentHomeView({ data, email }: { data: StudentHome; email: string | null }) {
  if (data.access === "denied") {
    return (
      <div className="gd-empty">
        <h1>This page is for students</h1>
        <p>Your account doesn't have a student profile.</p>
      </div>
    );
  }
  if (data.access === "not_ready") {
    return (
      <div className="gd-empty">
        <h1>Student accounts aren't switched on yet</h1>
        <p>Please try again later.</p>
      </div>
    );
  }
  const done = STEPS.filter((step) => data.steps[step.key]).length;
  const latest = data.projects[0];
  const request = data.requests[0];

  return (
    <div className="gd student-home">
      <header className="gd-header">
        <div>
          <h1>My FutureMe</h1>
          <p>{email ? `Signed in as ${email}` : "Your projects and next steps in one place."}</p>
        </div>
        <Button asChild variant="premium">
          <Link to="/discover">
            <Compass /> New discovery
          </Link>
        </Button>
      </header>

      {!data.linked || data.projects.length === 0 ? (
        <div className="gd-empty mt-5">
          <Sparkles />
          <h2>Your journey starts here</h2>
          <p>Answer five quick questions and get a project made for you.</p>
          <Button asChild variant="premium">
            <Link to="/discover">Start my discovery</Link>
          </Button>
        </div>
      ) : (
        <div className="gd-body mt-5">
          <section className="gd-kpis" aria-label="My summary">
            <Stat icon={Sparkles} label="Projects" value={String(data.projects.length)} />
            <Stat icon={BookOpen} label="Parent Briefs" value={String(data.briefs.length)} />
            <Stat
              icon={Clock3}
              label="Time exploring"
              value={formatDuration(data.active_seconds)}
            />
            <Stat icon={CheckCircle2} label="Journey steps" value={`${done} of ${STEPS.length}`} />
          </section>

          <section className="gd-card">
            <div className="gd-card-head">
              <h2>My journey</h2>
            </div>
            <ol className="journey-steps">
              {STEPS.map((step) => (
                <li key={step.key} className={data.steps[step.key] ? "is-done" : ""}>
                  {data.steps[step.key] ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  <span>{step.label}</span>
                </li>
              ))}
            </ol>
          </section>

          <div className="gd-grid-2">
            <section className="gd-card">
              <div className="gd-card-head">
                <h2>My projects</h2>
              </div>
              <ul className="student-projects">
                {data.projects.map((project) => {
                  const brief = data.briefs.find((b) => b.project_id === project.id);
                  return (
                    <li key={project.id}>
                      <div>
                        <strong>{project.title}</strong>
                        <p>{project.tagline}</p>
                        <span className="chip">{cap(project.interest)}</span>
                        <span className="chip">{cap(project.technology)}</span>
                        <small>{day(project.created_at)}</small>
                      </div>
                      <div className="student-project-links">
                        <a className="text-link" href={`/project?id=${project.id}`}>
                          Open project <ArrowUpRight size={14} />
                        </a>
                        {brief && (
                          <a className="text-link" href={`/parent?id=${brief.id}`}>
                            Parent Brief <ArrowUpRight size={14} />
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <div className="student-side">
              <section className="gd-card">
                <div className="gd-card-head">
                  <h2>
                    <PhoneCall size={16} /> My counsellor
                  </h2>
                </div>
                {request ? (
                  <div className="student-request">
                    <strong>{REQUEST_LABELS[request.status] ?? "Request received."}</strong>
                    {request.next_follow_up_at && request.status === "follow_up" && (
                      <p>Next call planned for {day(request.next_follow_up_at)}.</p>
                    )}
                    <small>Requested on {day(request.created_at)}</small>
                  </div>
                ) : (
                  <p className="gd-muted">
                    Have questions about NIAT? Ask for a callback from your project page.
                  </p>
                )}
              </section>

              <section className="gd-card">
                <div className="gd-card-head">
                  <h2>
                    <ClipboardList size={16} /> My application details
                  </h2>
                </div>
                {data.profile ? (
                  <dl className="student-profile">
                    <div>
                      <dt>Name</dt>
                      <dd>{data.profile.student_name}</dd>
                    </div>
                    <div>
                      <dt>City</dt>
                      <dd>
                        {data.profile.city}, {data.profile.state}
                      </dd>
                    </div>
                    <div>
                      <dt>Qualification</dt>
                      <dd>{label(qualificationOptions, data.profile.qualification)}</dd>
                    </div>
                    <div>
                      <dt>Course</dt>
                      <dd>{label(courseOptions, data.profile.intended_course)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="gd-muted">Not saved yet.</p>
                )}
                {latest && (
                  <a className="text-link mt-3" href={`/project?id=${latest.id}`}>
                    {data.profile
                      ? "Review or copy on my project page"
                      : "Save them on my project page"}{" "}
                    <ArrowUpRight size={14} />
                  </a>
                )}
                <p className="gd-foot">
                  Pre-application details only. Apply on the official NIAT portal yourself.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label: text,
  value,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
}) {
  return (
    <article className="gd-kpi">
      <div className="gd-kpi-top">
        <span className="gd-kpi-icon">
          <Icon size={16} />
        </span>
        <span>{text}</span>
      </div>
      <strong>{value}</strong>
    </article>
  );
}
