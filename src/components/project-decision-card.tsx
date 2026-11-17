import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, Check, Copy, PhoneCall, Send, Share2, Users } from "lucide-react";

import { CounsellorDialog, FamilyDialog, ParentBriefLauncher } from "@/components/family-actions";
import { Button } from "@/components/ui/button";
import { honestyNote, inviteMessage } from "@/lib/family-copy";
import { NIAT_SOURCE_URL, niatFacts } from "@/lib/niat-facts";
import { inviteValueCopy } from "@/lib/journey-copy";
import { niatApplicationUrl } from "@/lib/niat-links";
import type { ParentLanguage } from "@/lib/parent-experience";
import { getProjectReferral, recordShare } from "@/lib/sharing";
import { track } from "@/lib/tracking";

function InviteFriend({ projectId, language }: { projectId: string; language: ParentLanguage }) {
  const message = inviteMessage[language];
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getProjectReferral(projectId).then(({ url }) => {
      if (!cancelled) setShareUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(`${message} ${shareUrl}`);
      setCopied(true);
      setCopyFailed(false);
      recordShare(projectId, "copy");
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <>
      <Button
        variant="soft"
        onClick={() => {
          setCopied(false);
          setOpen(true);
        }}
      >
        <Send /> Invite a friend
      </Button>
      {open && (
        <FamilyDialog title={message} onClose={() => setOpen(false)}>
          <p>{inviteValueCopy}</p>
          {shareUrl && <code className="share-link">{shareUrl}</code>}
          <div className="modal-actions">
            <Button variant="premium" disabled={!shareUrl} onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />} {copied ? "Invitation copied" : "Copy invitation"}
            </Button>
            <Button variant="soft" asChild disabled={!shareUrl}>
              <a
                href={
                  shareUrl
                    ? `https://wa.me/?text=${encodeURIComponent(`${message} ${shareUrl}`)}`
                    : undefined
                }
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => recordShare(projectId, "whatsapp")}
              >
                <Share2 /> WhatsApp <ArrowUpRight />
              </a>
            </Button>
          </div>
          {copyFailed && <p role="alert">Copy this link: {shareUrl}</p>}
        </FamilyDialog>
      )}
    </>
  );
}

export function ProjectDecisionCard({
  projectId,
  language,
}: {
  projectId: string;
  language: ParentLanguage;
}) {
  const yearOne = niatFacts.find((fact) => fact.id === "year-one-topics");
  const degree = niatFacts.find((fact) => fact.id === "partner-university-degree");

  return (
    <section className="decision-section" aria-labelledby="first-year-title">
      <div className="demo-panel niat-year-card">
        <div className="demo-top">
          <div>
            <p className="eyebrow">A PEEK AT THE LEARNING</p>
            <h2 id="first-year-title">First year at NIAT</h2>
          </div>
          <BookOpen className="text-primary" />
        </div>
        {yearOne && <p>{yearOne.text}</p>}
        {degree && <p className="niat-degree-note">{degree.text}</p>}
        <a
          className="text-link"
          href={NIAT_SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            void track({ event: "cta_clicked", cta: "visit_niat", project_id: projectId })
          }
        >
          Read more on the official NIAT website <ArrowUpRight size={14} />
        </a>
      </div>

      <div className="family-panel decision-card">
        <div className="decision-card-heading">
          <p className="eyebrow">YOUR NEXT MOVE</p>
          <h2>Explore first. Decide together.</h2>
          <p>Choose what feels useful now—there is no pressure to apply.</p>
        </div>
        <ul className="next-step-cards">
          <li className="next-step-card next-step-recommended">
            <span className="next-step-badge">Recommended</span>
            <BookOpen className="text-primary" aria-hidden="true" />
            <h3>Share with my parents</h3>
            <p>Creates a one-page brief in English, हिन्दी or తెలుగు. It does not contact NIAT.</p>
            <ParentBriefLauncher projectId={projectId} initialLanguage={language} />
          </li>
          <li className="next-step-card">
            <Users className="text-primary" aria-hidden="true" />
            <h3>Invite a friend</h3>
            <p>{inviteValueCopy}</p>
            <InviteFriend projectId={projectId} language={language} />
          </li>
          <li className="next-step-card">
            <PhoneCall className="text-primary" aria-hidden="true" />
            <h3>Talk to a counsellor</h3>
            <p>Request a call back. This is not an application.</p>
            <CounsellorDialog projectId={projectId} initialLanguage={language} />
          </li>
          <li className="next-step-card">
            <ArrowUpRight className="text-primary" aria-hidden="true" />
            <h3>Start my application</h3>
            <p>Opens the NIAT apply page in a new tab. Nothing is submitted from here.</p>
            <Button asChild variant="soft">
              <a
                href={niatApplicationUrl("decisionCard")}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Start my application (opens the external NIAT page in a new tab)"
                onClick={() =>
                  void track({
                    event: "cta_clicked",
                    cta: "start_application",
                    project_id: projectId,
                  })
                }
              >
                Start my application <ArrowUpRight />
              </a>
            </Button>
          </li>
        </ul>
        <p className="honesty-note">{honestyNote[language]}</p>
      </div>
    </section>
  );
}
