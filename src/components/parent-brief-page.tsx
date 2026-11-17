import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, BookOpen, ShieldCheck } from "lucide-react";

import { CounsellorForm } from "@/components/family-actions";
import { ParentBriefShare, ParentQuestionBox } from "@/components/parent-brief-tools";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";
import { honestyNote } from "@/lib/family-copy";
import { niatFacts } from "@/lib/niat-facts";
import { niatApplicationUrl } from "@/lib/niat-links";
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
          <h1>Brief not found.</h1>
          <p>
            This link may be incomplete or expired. Ask your child to share it again, or start from
            the home page.
          </p>
          <div className="project-tools">
            <Button asChild variant="premium">
              <Link to="/">
                <ArrowLeft /> Go to the home page
              </Link>
            </Button>
          </div>
        </div>
      </SiteShell>
    );
  }

  const content = brief.content;
  const lang = brief.language === "hindi" ? "hi" : brief.language === "telugu" ? "te" : "en";
  return (
    <SiteShell>
      <div className="page-width parent-brief-page" lang={lang}>
        <header className="parent-brief-header">
          <span className="hero-pill">
            <BookOpen size={13} /> FUTUREME FAMILY · PARENT BRIEF
          </span>
          <h1>{content.headline}</h1>
          <p className="prepared-from">
            Prepared from <strong>{brief.project_title}</strong> and verified NIAT facts (verified{" "}
            {niatFacts[0]?.verified_on}).
          </p>
        </header>

        <section className="fact-sheet niat-clarity-box" aria-labelledby="niat-box-title">
          <div className="demo-top">
            <h2 id="niat-box-title">What NIAT is and is not</h2>
            <ShieldCheck className="text-mint" aria-hidden="true" />
          </div>
          <p>{content.what_niat_is_and_is_not}</p>
          <details className="fact-details">
            <summary>See the {niatFacts.length} verified facts</summary>
            <p>
              Every NIAT statement here is limited to these facts, verified on{" "}
              {niatFacts[0]?.verified_on}.
            </p>
            <ul>
              {niatFacts.map((fact) => (
                <li key={fact.id}>
                  {fact.text}{" "}
                  <a href={fact.source_url} target="_blank" rel="noopener noreferrer">
                    Source <ArrowUpRight size={12} />
                  </a>
                </li>
              ))}
            </ul>
          </details>
        </section>

        <div className="parent-brief-grid">
          <section className="demo-panel">
            <p className="eyebrow">THE DISCOVERY</p>
            <h2>What your child explored</h2>
            <p>{content.what_your_child_explored}</p>
          </section>
          <section className="demo-panel">
            <p className="eyebrow">THE PROJECT</p>
            <h2>The project</h2>
            <p>{content.project_summary}</p>
          </section>
          <section className="demo-panel">
            <p className="eyebrow">THE FIT</p>
            <h2>Why this fits</h2>
            <p>{content.why_this_fits}</p>
          </section>
        </div>

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

        <section
          id="counsellor-request"
          className="demo-panel parent-counsellor"
          aria-labelledby="counsellor-title"
        >
          <p className="eyebrow">WHEN YOU'RE READY</p>
          <h2 id="counsellor-title">Talk it through with a counsellor</h2>
          <CounsellorForm
            projectId={brief.project_id}
            briefId={brief.id}
            initialLanguage={brief.language}
            onFirstInteraction={() =>
              void track({
                event: "cta_clicked",
                cta: "talk_to_counsellor",
                project_id: brief.project_id,
                brief_id: brief.id,
              })
            }
          />
        </section>

        <section className="parent-closing">
          <div>
            <Button asChild variant="soft">
              <a
                href={niatApplicationUrl("parentPage")}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Start application (opens the external NIAT page in a new tab)"
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
            <p className="decision-helper">
              Opens the external NIAT page in a new tab. A counsellor call is not an application.
            </p>
          </div>
          <div>
            <p className="family-field-label">Share this brief</p>
            <ParentBriefShare
              briefId={brief.id}
              language={brief.language}
              referralCode={referralCode}
            />
          </div>
          <Link to="/project" search={{ id: brief.project_id }} className="text-link">
            <ArrowLeft size={14} /> See the full project
          </Link>
        </section>

        <p className="honesty-note">{honestyNote[brief.language]}</p>
      </div>
    </SiteShell>
  );
}
