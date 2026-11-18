import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, Check, Copy, PhoneCall, Send, Share2, Users } from "lucide-react";

import { ApplicationProfileDialog } from "@/components/application-profile";
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
  classStatus,
}: {
  projectId: string;
  language: ParentLanguage;
  classStatus?: string | undefined;
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
          className="text-link mt-4"
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
          <p className="eyebrow">FROM EXPLORATION TO DECISION</p>
          <h2>Your Next Step with NIAT</h2>
          <p>
            You have explored what you could build. Now discuss the opportunity with your family,
            get the information you need and decide whether applying to NIAT is right for you.
          </p>
        </div>
        <ul className="next-step-cards">
          <li className="next-step-card next-step-recommended">
            <span className="next-step-badge">Recommended action</span>
            <BookOpen className="text-primary" aria-hidden="true" />
            <h3>Share the Parent Brief with my family</h3>
            <p>
              Create a brief with your project and verified NIAT information in English, हिन्दी or
              తెలుగు. It does not contact NIAT.
            </p>
            <ParentBriefLauncher projectId={projectId} initialLanguage={language} />
          </li>
          <li className="next-step-card">
            <PhoneCall className="text-primary" aria-hidden="true" />
            <h3>Talk to a NIAT counsellor</h3>
            <p>
              Request a callback from the team. This requires follow-up and is not an instant call
              or an application.
            </p>
            <CounsellorDialog projectId={projectId} initialLanguage={language} />
          </li>
          <li className="next-step-card">
            <ArrowUpRight className="text-primary" aria-hidden="true" />
            <h3>Continue to the NIAT application</h3>
            <p>
              Opens the official NIAT application page in a new tab. Nothing is submitted
              automatically. You can also save your details here to copy across yourself.
            </p>
            <Button asChild variant="premium">
              <a
                href={niatApplicationUrl("decisionCard")}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Continue to the NIAT application (opens the official NIAT application page in a new tab)"
                onClick={() =>
                  void track({
                    event: "cta_clicked",
                    cta: "start_application",
                    project_id: projectId,
                  })
                }
              >
                Continue to application <ArrowUpRight />
              </a>
            </Button>
            <ApplicationProfileDialog projectId={projectId} classStatus={classStatus} />
          </li>
          <li className="next-step-card">
            <Users className="text-primary" aria-hidden="true" />
            <h3>Invite a friend</h3>
            <p>Optional: {inviteValueCopy}</p>
            <InviteFriend projectId={projectId} language={language} />
          </li>
        </ul>
        <p className="honesty-note">{honestyNote[language]}</p>
      </div>
    </section>
  );
}
