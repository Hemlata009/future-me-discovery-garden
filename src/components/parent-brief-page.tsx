import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, BookOpen, ShieldCheck } from "lucide-react";

import { CounsellorDialog } from "@/components/family-actions";
import { ParentBriefShare, ParentQuestionBox } from "@/components/parent-brief-tools";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { niatFacts } from "@/lib/niat-facts";
import type { ParentBrief } from "@/lib/parent-briefs.functions";
import { referralCodeSchema, track } from "@/lib/tracking";

export function ParentBriefPageView({
  brief,
  referralCode,
}: {
  brief: ParentBrief | null;
  referralCode?: string | undefined;
}) {
  useEffect(() => {
    if (!brief) return;
    const ref = referralCodeSchema.safeParse(referralCode);
    void (async () => {
      // Referral attribution is recorded before the brief-open event.
      if (ref.success) await track({ event: "referral_visit", ref: ref.data });
      await track({ event: "parent_brief_opened", brief_id: brief.id });
    })();
  }, [brief, referralCode]);

  if (!brief) {
    return (
      <SiteShell>
        <div className="page-width page-intro">
          <p className="eyebrow">PARENT BRIEF</p>
          <h1>We couldn't find that brief.</h1>
          <p>
            The link may be incomplete. Open the generated project again to create a fresh Parent
            Brief.
          </p>
          <div className="project-tools">
            <Button asChild variant="premium">
              <Link to="/projects">
                <ArrowLeft /> Explore projects
              </Link>
            </Button>
          </div>
        </div>
      </SiteShell>
    );
  }

  const content = brief.content;
  return (
    <SiteShell>
      <div className="page-width parent-brief-page">
        <div className="mt-8">
          <Link to="/project" search={{ id: brief.project_id }} className="text-link">
            <ArrowLeft size={14} /> Back to the project
          </Link>
        </div>
        <header className="parent-brief-header">
          <span className="hero-pill">
            <BookOpen size={13} /> FUTUREME AI · PARENT BRIEF
          </span>
          <h1>{content.headline}</h1>
          <p>
            A family-friendly view of <strong>{brief.project_title}</strong>, written from the
            student's discovery and the verified facts below.
          </p>
          <ParentBriefShare
            briefId={brief.id}
            headline={content.headline}
            referralCode={referralCode}
          />
        </header>

        <div className="parent-brief-grid">
          <section className="demo-panel">
            <p className="eyebrow">THE DISCOVERY</p>
            <h2>What your child explored</h2>
            <p>{content.what_your_child_explored}</p>
          </section>
          <section className="demo-panel">
            <p className="eyebrow">THE PROJECT</p>
            <h2>What it means in practice</h2>
            <p>{content.project_summary}</p>
          </section>
          <section className="demo-panel">
            <p className="eyebrow">THE FIT</p>
            <h2>Why this matched them</h2>
            <p>{content.why_this_fits}</p>
          </section>
          <section className="demo-panel">
            <p className="eyebrow">NIAT, CLEARLY EXPLAINED</p>
            <h2>NIAT in this brief</h2>
            <p>{content.what_niat_is_and_is_not}</p>
          </section>
        </div>

        <section className="fact-sheet niat-clarity-box">
          <div className="demo-top">
            <div>
              <p className="eyebrow">SOURCE BOUNDARIES</p>
              <h2>What NIAT is and is not</h2>
            </div>
            <ShieldCheck className="text-mint" />
          </div>
          <p>
            Every NIAT statement in the brief and Q&A is limited to these facts, verified on{" "}
            {niatFacts[0]?.verified_on}.
          </p>
          <ul>
            {niatFacts.map((fact) => (
              <li key={fact.id}>
                {fact.text}{" "}
                <a href={fact.source_url} target="_blank" rel="noreferrer">
                  Source <ArrowUpRight size={12} />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <div className="result-layout parent-guidance-layout">
          <section className="demo-panel">
            <p className="eyebrow">A USEFUL CONVERSATION</p>
            <h2>Questions to ask a counsellor</h2>
            <ol className="roadmap-list">
              {content.questions_to_ask_a_counsellor.map((question, index) => (
                <li key={question}>
                  <span className="step-icon">0{index + 1}</span>
                  <span>{question}</span>
                </li>
              ))}
            </ol>
          </section>
          <ParentQuestionBox briefId={brief.id} />
        </div>

        <section className="family-panel parent-next-step">
          <div>
            <p className="eyebrow">WHEN YOU'RE READY</p>
            <h2>Explore first. Decide with the facts.</h2>
            <p>
              An application is separate from a counsellor-call request. Neither is an admission or
              an outcome guarantee.
            </p>
            <p className="decision-external-note">
              “Start application” opens the external NIAT application page in a new tab.
            </p>
          </div>
          <div className="family-panel-actions">
            <CounsellorDialog
              projectId={brief.project_id}
              briefId={brief.id}
              initialLanguage={brief.language}
            />
            <Button asChild variant="premium">
              <a
                href="https://apply.niatindia.com/"
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  void track({
                    event: "cta_clicked",
                    cta: "start_application",
                    project_id: brief.project_id,
                    brief_id: brief.id,
                  })
                }
              >
                Start application <ArrowUpRight />
              </a>
            </Button>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
