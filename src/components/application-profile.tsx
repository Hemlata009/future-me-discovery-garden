import { useEffect, useId, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, ClipboardList, Copy, Download, Pencil, Trash2 } from "lucide-react";

import { FamilyDialog } from "@/components/family-actions";
import { Button } from "@/components/ui/button";
import {
  APPLICATION_PROFILE_ENDPOINT,
  applicationProfileText,
  courseOptions,
  emptyApplicationProfile,
  qualificationFromClassStatus,
  qualificationOptions,
  saveApplicationProfileSchema,
  type ApplicationProfileFields,
  type SavedApplicationProfile,
} from "@/lib/application-profile";
import { niatApplicationUrl } from "@/lib/niat-links";
import { track } from "@/lib/tracking";

type Field = keyof ApplicationProfileFields;
type ApiResult = {
  ok: boolean;
  profile?: SavedApplicationProfile | null;
  message?: string;
  fields?: string[];
};

const fieldMessages: Record<Field, string> = {
  student_name: "Enter the student's name (2–80 characters).",
  student_phone: "Enter a valid 10-digit Indian mobile number.",
  email: "Enter a valid email address or leave it empty.",
  city: "Enter your city.",
  state: "Enter your state.",
  qualification: "Choose your current qualification.",
  passing_year: "Enter a year such as 2026, or leave it empty.",
  intended_course: "Choose a course.",
};

async function callProfileApi(init?: RequestInit): Promise<ApiResult> {
  try {
    const response = await fetch(APPLICATION_PROFILE_ENDPOINT, {
      credentials: "same-origin",
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    return (await response.json()) as ApiResult;
  } catch {
    return { ok: false, message: "We couldn't reach the site. Check your connection." };
  }
}

function ProfileReview({
  profile,
  projectId,
  onEdit,
  onDeleted,
}: {
  profile: SavedApplicationProfile;
  projectId: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = applicationProfileText(profile);

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([summary], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "futureme-application-details.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function remove() {
    if (!window.confirm("Delete your saved application details from FutureMe Family?")) return;
    setDeleting(true);
    const result = await callProfileApi({ method: "DELETE" });
    setDeleting(false);
    if (result.ok) onDeleted();
    else setError(result.message ?? "Your details couldn't be deleted. Try again.");
  }

  const rows = summary.split("\n").slice(1, -1);
  return (
    <div>
      <p>
        Saved {new Date(profile.updated_at).toLocaleString()}. Check them, then copy them into the
        official NIAT application yourself. FutureMe Family does not fill in or submit the official
        form.
      </p>
      <dl className="profile-summary">
        {rows.map((row) => {
          const [label, ...rest] = row.split(": ");
          return (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{rest.join(": ")}</dd>
            </div>
          );
        })}
      </dl>
      <div className="modal-actions">
        <Button variant="premium" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />} {copied ? "Details copied" : "Copy details"}
        </Button>
        <Button variant="soft" onClick={download}>
          <Download /> Download as text
        </Button>
        <Button variant="soft" onClick={onEdit}>
          <Pencil /> Edit details
        </Button>
      </div>
      {copyFailed && (
        <p role="alert" className="field-error">
          Copy didn't work in this browser. Use "Download as text" instead.
        </p>
      )}
      <div className="modal-actions">
        <Button asChild variant="soft">
          <a
            href={niatApplicationUrl("decisionCard")}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              void track({ event: "cta_clicked", cta: "start_application", project_id: projectId })
            }
          >
            Open the official NIAT application <ArrowUpRight />
          </a>
        </Button>
        <Button variant="ghost" disabled={deleting} onClick={() => void remove()}>
          <Trash2 /> {deleting ? "Deleting…" : "Delete my saved details"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

function ProfileForm({
  initial,
  projectId,
  onSaved,
}: {
  initial: ApplicationProfileFields;
  projectId: string;
  onSaved: (profile: SavedApplicationProfile) => void;
}) {
  const uid = useId();
  const [values, setValues] = useState<ApplicationProfileFields>(initial);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field | "consent", string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (field: Field, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const payload = { ...values, generated_project_id: projectId, consent };
    const parsed = saveApplicationProfileSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Partial<Record<Field | "consent", string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as Field | "consent";
        next[key] ??= key === "consent" ? "Please tick the consent box." : fieldMessages[key];
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setPending(true);
    const result = await callProfileApi({ method: "PUT", body: JSON.stringify(parsed.data) });
    setPending(false);
    if (result.ok && result.profile) onSaved(result.profile);
    else {
      if (result.fields?.length) {
        setErrors(
          Object.fromEntries(
            result.fields
              .filter((field): field is Field => field in fieldMessages)
              .map((field) => [field, fieldMessages[field]]),
          ),
        );
      }
      setError(result.message ?? "Your details couldn't be saved. Try again.");
    }
  }

  const input = (
    field: Field,
    label: string,
    props: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {},
  ) => (
    <div className="family-field">
      <label htmlFor={`${uid}-${field}`}>{label}</label>
      <input
        id={`${uid}-${field}`}
        value={values[field]}
        onChange={(event) =>
          set(
            field,
            field === "student_phone"
              ? event.target.value.replace(/\D/g, "").slice(0, 10)
              : event.target.value,
          )
        }
        aria-invalid={Boolean(errors[field])}
        aria-describedby={errors[field] ? `${uid}-${field}-error` : undefined}
        {...props}
      />
      {errors[field] && (
        <p id={`${uid}-${field}-error`} className="field-error">
          {errors[field]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <p>
        Save the student's own details once, so they are ready to copy when you fill in the official
        NIAT application. This is pre-application information only, not a NIAT application, and
        nothing is sent to NIAT.
      </p>
      <div className="family-form-grid">
        {input("student_name", "Student's full name", { autoComplete: "name", maxLength: 80 })}
        {input("student_phone", "Student's mobile number", {
          autoComplete: "tel",
          inputMode: "numeric",
          maxLength: 10,
          placeholder: "10-digit mobile",
        })}
        {input("email", "Student's email (optional)", {
          type: "email",
          autoComplete: "email",
          maxLength: 120,
        })}
        {input("city", "City", { autoComplete: "address-level2", maxLength: 60 })}
        {input("state", "State", { autoComplete: "address-level1", maxLength: 60 })}
        <label className="family-field">
          Current qualification
          <select
            value={values.qualification}
            onChange={(event) => set("qualification", event.target.value)}
          >
            {qualificationOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {input("passing_year", "Year of passing Class 12 (optional)", {
          inputMode: "numeric",
          maxLength: 4,
          placeholder: "e.g. 2026",
        })}
        <label className="family-field">
          Intended course
          <select
            value={values.intended_course}
            onChange={(event) => set("intended_course", event.target.value)}
          >
            {courseOptions.map((option) => (
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
          aria-invalid={Boolean(errors.consent)}
          aria-describedby={`${uid}-privacy`}
        />
        <span>
          I am the student (or am helping the student with their permission) and I agree to FutureMe
          Family saving these details so I can review and copy them later. I understand this is not
          a NIAT application.
        </span>
      </label>
      <p id={`${uid}-privacy`} className="privacy-line">
        Saved only for this browser, read only by this site's server, never added to analytics and
        not shared with counsellors. You can edit or delete them at any time. Do not enter ID
        numbers, marks or payment details.
      </p>
      {errors.consent && <p className="field-error">{errors.consent}</p>}
      {error && (
        <div className="qa-card qa-fallback" role="alert">
          <strong>Your details weren't saved.</strong>
          <p>{error} Your details are still in the form, so you can try again.</p>
        </div>
      )}
      <div className="modal-actions">
        <Button variant="premium" size="lg" disabled={pending} type="submit">
          <ClipboardList /> {pending ? "Saving…" : "Save and review"}
        </Button>
      </div>
    </form>
  );
}

export function ApplicationProfileDialog({
  projectId,
  classStatus,
}: {
  projectId: string;
  classStatus?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState<SavedApplicationProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void callProfileApi().then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.ok) {
        setSaved(result.profile ?? null);
        setEditing(!result.profile);
      } else {
        setLoadError(result.message ?? "Please try again shortly.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const initial: ApplicationProfileFields = saved
    ? (({ updated_at: _updated, ...fields }) => fields)(saved)
    : { ...emptyApplicationProfile, qualification: qualificationFromClassStatus(classStatus) };

  return (
    <>
      <Button variant="soft" onClick={() => setOpen(true)}>
        <ClipboardList /> Save your application details
      </Button>
      {open && (
        <FamilyDialog title="Save your application details" onClose={() => setOpen(false)}>
          {loading ? (
            <p role="status">Loading your saved details…</p>
          ) : loadError ? (
            <div className="qa-card qa-fallback" role="alert">
              <strong>This isn't available right now.</strong>
              <p>{loadError}</p>
            </div>
          ) : saved && !editing ? (
            <ProfileReview
              profile={saved}
              projectId={projectId}
              onEdit={() => setEditing(true)}
              onDeleted={() => {
                setSaved(null);
                setEditing(true);
              }}
            />
          ) : (
            <ProfileForm
              key={saved?.updated_at ?? "new"}
              initial={initial}
              projectId={projectId}
              onSaved={(profile) => {
                setSaved(profile);
                setEditing(false);
              }}
            />
          )}
        </FamilyDialog>
      )}
    </>
  );
}
