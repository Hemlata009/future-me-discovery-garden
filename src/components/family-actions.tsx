import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, Check, PhoneCall, RotateCcw, Sparkles, X } from "lucide-react";

import { ParentBriefShare } from "@/components/parent-brief-tools";
import { Button } from "@/components/ui/button";
import { parentLanguageOptions, parentShareMessage } from "@/lib/family-copy";
import { counsellorRequestSchema, type ParentLanguage } from "@/lib/parent-experience";
import { parentBriefUrl } from "@/lib/sharing";
import { getProjectReferral } from "@/lib/sharing";
import { ensureVisitor, track } from "@/lib/tracking";

export function FamilyDialog({
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

function LanguageSegments({
  value,
  onChange,
  disabled,
}: {
  value: ParentLanguage;
  onChange: (language: ParentLanguage) => void;
  disabled?: boolean;
}) {
  return (
    <div className="language-segments" role="radiogroup" aria-label="Brief language">
      {parentLanguageOptions.map((option) => (
        <Button
          key={option.value}
          type="button"
          variant="ghost"
          role="radio"
          aria-checked={value === option.value}
          lang={option.value === "hindi" ? "hi" : option.value === "telugu" ? "te" : "en"}
          className={value === option.value ? "segment segment-active" : "segment"}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function ParentBriefLauncher({
  projectId,
  initialLanguage,
}: {
  projectId: string;
  initialLanguage: ParentLanguage;
}) {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<ParentLanguage>(initialLanguage);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState<{ id: string; code: string | null } | null>(null);

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
      const referral = await getProjectReferral(projectId);
      setBrief({ id: data.brief_id, code: referral.code });
      setPending(false);
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
      <Button
        variant="premium"
        onClick={() => {
          setBrief(null);
          setError(null);
          setOpen(true);
        }}
      >
        <BookOpen /> Share with my parents
      </Button>
      {open && (
        <FamilyDialog
          title={brief ? "Your Parent Brief is ready." : "A clear brief for your family."}
          onClose={() => !pending && setOpen(false)}
        >
          {brief ? (
            <>
              <p>Your parents will receive this message:</p>
              <p className="share-preview">
                “
                {parentShareMessage(
                  language,
                  parentBriefUrl(window.location.origin, brief.id, brief.code),
                )}
                ”
              </p>
              <ParentBriefShare briefId={brief.id} language={language} referralCode={brief.code} />
              <div className="modal-actions">
                <Button asChild variant="premium">
                  <Link to="/parent" search={{ id: brief.id, ref: brief.code ?? undefined }}>
                    Open Parent Brief
                  </Link>
                </Button>
                <Button variant="ghost" onClick={() => setBrief(null)}>
                  Choose another language
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>
                Turn this project into a simple explanation, grounded only in your child's discovery
                and verified NIAT facts.
              </p>
              <p className="family-field-label">Brief language</p>
              <LanguageSegments value={language} onChange={setLanguage} disabled={pending} />
              {pending && (
                <p className="form-status" role="status">
                  Writing your brief… this usually takes a few seconds.
                </p>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <Button variant="premium" disabled={pending} onClick={() => void generate()}>
                  {error ? <RotateCcw /> : <Sparkles />}{" "}
                  {pending ? "Writing your brief…" : error ? "Try again" : "Create Parent Brief"}
                </Button>
              </div>
              <p className="family-fine-print">
                No outcome promises, invented figures, or admission guarantees.
              </p>
            </>
          )}
        </FamilyDialog>
      )}
    </>
  );
}

type CounsellorField = "contact_name" | "phone" | "consent";

export function CounsellorForm({
  projectId,
  briefId,
  initialLanguage,
  onFirstInteraction,
  onDone,
}: {
  projectId: string;
  briefId?: string;
  initialLanguage: ParentLanguage;
  onFirstInteraction?: () => void;
  onDone?: () => void;
}) {
  const uid = useId();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [who, setWho] = useState<"student" | "parent">("parent");
  const [language, setLanguage] = useState<ParentLanguage>(initialLanguage);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CounsellorField, string>>>({});
  const [success, setSuccess] = useState<string | null>(null);
  const touched = useRef(false);

  function interacted() {
    if (touched.current) return;
    touched.current = true;
    onFirstInteraction?.();
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
      const next: Partial<Record<CounsellorField, string>> = {};
      for (const issue of valid.error.issues) {
        const key = issue.path[0];
        if (key === "contact_name") next.contact_name ??= "Please enter your name (2–80 letters).";
        else if (key === "phone" || key === "consent") next[key] ??= issue.message;
      }
      setFieldErrors(next);
      if (!Object.keys(next).length) setError("Please check the form.");
      return;
    }
    setFieldErrors({});
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

  if (success) {
    return (
      <div className="form-success" role="status">
        <Check className="text-mint" />
        <div>
          <strong>Your request is saved.</strong>
          <p>{success}</p>
        </div>
        {onDone && (
          <Button variant="premium" onClick={onDone}>
            Done
          </Button>
        )}
      </div>
    );
  }

  const ids = {
    name: `${uid}-name`,
    phone: `${uid}-phone`,
    nameError: `${uid}-name-error`,
    phoneError: `${uid}-phone-error`,
    consentError: `${uid}-consent-error`,
    privacy: `${uid}-privacy`,
  };
  return (
    <form onSubmit={(event) => void submit(event)} onFocus={interacted} noValidate>
      <p>
        Ask for a call about NIAT, the partner university, or your child's next step. This is not an
        application.
      </p>
      <div className="family-form-grid">
        <div className="family-field">
          <label htmlFor={ids.name}>Your name</label>
          <input
            id={ids.name}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            maxLength={80}
            required
            aria-invalid={Boolean(fieldErrors.contact_name)}
            aria-describedby={fieldErrors.contact_name ? ids.nameError : undefined}
          />
          {fieldErrors.contact_name && (
            <p id={ids.nameError} className="field-error">
              {fieldErrors.contact_name}
            </p>
          )}
        </div>
        <div className="family-field">
          <label htmlFor={ids.phone}>Indian mobile number</label>
          <input
            id={ids.phone}
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
            autoComplete="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="10-digit mobile"
            required
            aria-invalid={Boolean(fieldErrors.phone)}
            aria-describedby={fieldErrors.phone ? ids.phoneError : undefined}
          />
          {fieldErrors.phone && (
            <p id={ids.phoneError} className="field-error">
              {fieldErrors.phone}
            </p>
          )}
        </div>
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
          aria-invalid={Boolean(fieldErrors.consent)}
          aria-describedby={
            fieldErrors.consent ? `${ids.consentError} ${ids.privacy}` : ids.privacy
          }
        />
        <span>
          I consent to being contacted by a NIAT counsellor about this request. I understand this is
          not an application or admission.
        </span>
      </label>
      <p id={ids.privacy} className="privacy-line">
        We collect your name, mobile number, student/parent choice and language only to call you
        back about this request. Only authorised counsellors and site administrators see them; they
        are never added to analytics and are deleted after 180 days.
      </p>
      {fieldErrors.consent && (
        <p id={ids.consentError} className="field-error">
          {fieldErrors.consent}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <Button variant="premium" size="lg" disabled={pending} type="submit">
          <PhoneCall /> {pending ? "Saving request…" : "Request a counsellor call"}
        </Button>
      </div>
    </form>
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

  function showForm() {
    setOpen(true);
    void track({
      event: "cta_clicked",
      cta: "talk_to_counsellor",
      project_id: projectId,
      ...(briefId ? { brief_id: briefId } : {}),
    });
  }

  return (
    <>
      <Button variant="soft" onClick={showForm}>
        <PhoneCall /> Talk to a counsellor
      </Button>
      {open && (
        <FamilyDialog title="Talk it through with a counsellor." onClose={() => setOpen(false)}>
          <CounsellorForm
            projectId={projectId}
            {...(briefId ? { briefId } : {})}
            initialLanguage={initialLanguage}
            onDone={() => setOpen(false)}
          />
        </FamilyDialog>
      )}
    </>
  );
}
