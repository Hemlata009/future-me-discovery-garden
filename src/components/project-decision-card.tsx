import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, Check, Copy, Send, Share2 } from "lucide-react";

import { CounsellorDialog, FamilyDialog, ParentBriefLauncher } from "@/components/family-actions";
import { Button } from "@/components/ui/button";
import { honestyNote } from "@/lib/family-copy";
import { niatFacts } from "@/lib/niat-facts";
import type { ParentLanguage } from "@/lib/parent-experience";
import { getProjectReferral, recordShare } from "@/lib/sharing";
import { track } from "@/lib/tracking";

const INVITE_MESSAGE = "Explore tech with me - takes 5 minutes";

function InviteFriend({ projectId }: { projectId: string }) {
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
      await navigator.clipboard.writeText(`${INVITE_MESSAGE} ${shareUrl}`);
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
        <FamilyDialog title={INVITE_MESSAGE} onClose={() => setOpen(false)}>
          <p>Share your project referral link with a friend on WhatsApp or copy it for them.</p>
          {shareUrl && <code className="share-link">{shareUrl}</code>}
          <div className="modal-actions">
            <Button variant="premium" disabled={!shareUrl} onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />} {copied ? "Invitation copied" : "Copy invitation"}
            </Button>
            <Button variant="soft" asChild disabled={!shareUrl}>
              <a
                href={
                  shareUrl
                    ? `https://wa.me/?text=${encodeURIComponent(`${INVITE_MESSAGE} ${shareUrl}`)}`
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
      </div>

      <div className="family-panel decision-card">
        <div className="decision-card-heading">
          <p className="eyebrow">YOUR NEXT MOVE</p>
          <h2>Explore first. Decide together.</h2>
          <p>Choose what feels useful now—there is no pressure to apply.</p>
        </div>
        <div className="decision-primary">
          <ParentBriefLauncher projectId={projectId} initialLanguage={language} />
          <p className="decision-helper">
            Creates a one-page brief for your family in English, हिन्दी or తెలుగు.
          </p>
        </div>
        <div className="decision-actions">
          <div className="decision-action">
            <InviteFriend projectId={projectId} />
            <p className="decision-helper">Copy or WhatsApp your link to a friend.</p>
          </div>
          <div className="decision-action">
            <CounsellorDialog projectId={projectId} initialLanguage={language} />
            <p className="decision-helper">Request a call back. This is not an application.</p>
          </div>
          <div className="decision-action">
            <Button asChild variant="soft">
              <a
                href="https://apply.niatindia.com/"
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
            <p className="decision-helper">Opens the external NIAT page in a new tab.</p>
          </div>
        </div>
        <p className="honesty-note">{honestyNote[language]}</p>
      </div>
    </section>
  );
}
