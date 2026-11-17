import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Check, PhoneCall, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { counsellorRequestSchema, type ParentLanguage } from "@/lib/parent-experience";
import { ensureVisitor, track } from "@/lib/tracking";

function FamilyDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal family-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="family-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          ref={closeRef}
          className="modal-close"
          variant="ghost"
          size="icon"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X />
        </Button>
        <h2 id="family-dialog-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const languageOptions = [
  { value: "english", label: "English" },
  { value: "hindi", label: "हिन्दी · Hindi" },
  { value: "telugu", label: "తెలుగు · Telugu" },
] as const;

export function ParentBriefLauncher({
  projectId,
  initialLanguage,
}: {
  projectId: string;
  initialLanguage: ParentLanguage;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<ParentLanguage>(initialLanguage);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setError(null);
    try {
      await ensureVisitor();
      const response = await fetch("/api/parent-brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ project_id: projectId, language }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        brief_id?: string;
        message?: string;
      } | null;
      if (!response.ok || !data?.ok || !data.brief_id)
        throw new Error(data?.message || "The parent brief couldn't be created. Please try again.");
      await navigate({ to: "/parent-brief", search: { id: data.brief_id } });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The parent brief couldn't be created. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="premium" onClick={() => setOpen(true)}>
        <BookOpen /> Make a Parent Brief
      </Button>
      {open && (
        <FamilyDialog
          title="A clear brief for your family."
          onClose={() => !pending && setOpen(false)}
        >
          <p>
            Turn this project into a simple explanation, grounded only in your child's discovery and
            verified NIAT facts.
          </p>
          <label className="family-field">
            Brief language
            <select
              value={language}
              disabled={pending}
              onChange={(event) => setLanguage(event.target.value as ParentLanguage)}
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button variant="premium" disabled={pending} onClick={() => void generate()}>
              <Sparkles /> {pending ? "Writing the brief…" : "Create Parent Brief"}
            </Button>
          </div>
          <p className="family-fine-print">
            No outcome promises, invented figures, or admission guarantees.
          </p>
        </FamilyDialog>
      )}
    </>
  );
}

export function CounsellorDialog({
  projectId,
  briefId,
  initialLanguage,
}: {
  projectId: string;
  briefId?: string;
  initialLanguage: ParentLanguage;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [who, setWho] = useState<"student" | "parent">("parent");
  const [language, setLanguage] = useState<ParentLanguage>(initialLanguage);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function showForm() {
    setOpen(true);
    void track({
      event: "cta_clicked",
      cta: "talk_to_counsellor",
      project_id: projectId,
      ...(briefId ? { brief_id: briefId } : {}),
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const candidate = {
      generated_project_id: projectId,
      ...(briefId ? { parent_brief_id: briefId } : {}),
      contact_name: name,
      phone,
      who,
      language,
      consent,
    };
    const valid = counsellorRequestSchema.safeParse(candidate);
    if (!valid.success) {
      setError(valid.error.issues[0]?.message ?? "Please check the form.");
      return;
    }
    setPending(true);
    try {
      await ensureVisitor();
      const response = await fetch("/api/counsellor-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(valid.data),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;
      if (!response.ok || !data?.ok)
        throw new Error(data?.message || "We couldn't save your request. Please try again.");
      setSuccess(data.message ?? "Your counsellor call request is saved.");
      setName("");
      setPhone("");
      setConsent(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "We couldn't save your request. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="soft" onClick={showForm}>
        <PhoneCall /> Talk to a counsellor
      </Button>
      {open && (
        <FamilyDialog
          title={success ? "Your request is saved." : "Talk it through with a counsellor."}
          onClose={() => !pending && setOpen(false)}
        >
          {success ? (
            <>
              <Check className="text-mint" />
              <p role="status">{success}</p>
              <div className="modal-actions">
                <Button variant="premium" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              <p>
                Ask for a call about NIAT, the partner university, or your child's next step. This
                is not an application.
              </p>
              <div className="family-form-grid">
                <label className="family-field">
                  Your name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    maxLength={80}
                    required
                  />
                </label>
                <label className="family-field">
                  Indian mobile number
                  <input
                    value={phone}
                    onChange={(event) =>
                      setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    autoComplete="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit mobile"
                    required
                  />
                </label>
                <label className="family-field">
                  I am a
                  <select
                    value={who}
                    onChange={(event) => setWho(event.target.value as "student" | "parent")}
                  >
                    <option value="parent">Parent or guardian</option>
                    <option value="student">Student</option>
                  </select>
                </label>
                <label className="family-field">
                  Preferred language
                  <select
                    value={language}
                    onChange={(event) => setLanguage(event.target.value as ParentLanguage)}
                  >
                    {languageOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="consent-field">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>
                  I consent to being contacted by a NIAT counsellor about this request. I understand
                  this is not an application or admission.
                </span>
              </label>
              <p className="family-fine-print">
                Your details are used to respond to this request, are not added to analytics, and
                are deleted after 180 days.
              </p>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <Button variant="premium" disabled={pending || !consent} type="submit">
                  <PhoneCall /> {pending ? "Saving request…" : "Request a counsellor call"}
                </Button>
              </div>
            </form>
          )}
        </FamilyDialog>
      )}
    </>
  );
}

export function FamilyPanel({
  projectId,
  language,
}: {
  projectId: string;
  language: ParentLanguage;
}) {
  return (
    <section className="family-panel">
      <div>
        <p className="eyebrow">EXPLORE BEFORE YOU APPLY</p>
        <h2>Bring your family into the journey.</h2>
        <p>
          Share what you explored, ask grounded questions, and speak to a counsellor only when you
          choose.
        </p>
      </div>
      <div className="family-panel-actions">
        <ParentBriefLauncher projectId={projectId} initialLanguage={language} />
        <CounsellorDialog projectId={projectId} initialLanguage={language} />
      </div>
    </section>
  );
}
