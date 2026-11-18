# Saved pre-application details

Students can save their own details once ("Save your application details" in the
**Continue to the NIAT application** card on a generated project) and later review,
edit, copy, download or delete them before filling in the official portal
(`https://apply.niatindia.com/`) by hand.

What it is **not**:

- Not a NIAT application, admission, payment or fee step.
- Not an integration with the NIAT portal. Nothing is sent to NIAT, scraped or auto-filled.
- Not a lead. Saved details are not shown in `/counsellor` or `/admin` and are never
  copied into `growth_events` or any other analytics.

## Data and access

| Field             | Why it is collected                                            |
| ----------------- | -------------------------------------------------------------- |
| `student_name`    | Common first field of an application form                      |
| `student_phone`   | Student's own 10-digit Indian mobile (validated)               |
| `email`           | Optional                                                       |
| `city`, `state`   | Location fields of an application form                         |
| `qualification`   | Class 12 studying / completed / diploma / other                |
| `passing_year`    | Optional Class 12 year                                         |
| `intended_course` | Only the course in the verified NIAT fact sheet, or "not sure" |

No ID numbers, marks, income, documents or payment data are accepted: the server
rejects any field outside this list.

- One row per browser, keyed by the hashed, server-issued HttpOnly visitor cookie
  (the same identity used for generation limits). A browser can only read, update or
  delete its own row. A parent opening a shared link sees their own empty form, never
  the student's details. A counsellor request's contact details are never reused here.
- The table is service-role only (no grants to `anon`/`authenticated`, RLS on with no
  policies). Only `/api/application-profile` touches it, after a same-origin check,
  JSON-only body, 4 KB cap and Zod validation. Saving requires an explicit consent tick;
  `consent_at` records when.
- Until the table exists the endpoint answers `503 not-ready` and the form shows
  "isn't switched on yet". Nothing else in the app is affected.

## One-time database setup (do this through Lovable)

The repository rules say schema changes are made by Lovable, not by hand in
`drizzle/`. Paste this into the Lovable chat:

> Please add a database migration that creates the table below exactly as written, then
> regenerate the Supabase types. Do not change any existing table, function or data.

```sql
CREATE TABLE public.pre_application_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_hash text NOT NULL UNIQUE CHECK (visitor_hash ~ '^[0-9a-f]{64}$'),
  generated_project_id uuid REFERENCES public.generated_projects(id) ON DELETE SET NULL,
  student_name text NOT NULL CHECK (char_length(student_name) BETWEEN 2 AND 80),
  student_phone text NOT NULL CHECK (student_phone ~ '^[6-9][0-9]{9}$'),
  email text CHECK (email IS NULL OR char_length(email) <= 120),
  city text NOT NULL CHECK (char_length(city) BETWEEN 2 AND 60),
  state text NOT NULL CHECK (char_length(state) BETWEEN 2 AND 60),
  qualification text NOT NULL
    CHECK (qualification IN ('class12_studying', 'class12_completed', 'diploma', 'other')),
  passing_year text CHECK (passing_year IS NULL OR passing_year ~ '^20[2-3][0-9]$'),
  intended_course text NOT NULL
    CHECK (intended_course IN ('btech_partner_university', 'not_sure')),
  consent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.pre_application_profiles FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pre_application_profiles TO service_role;
ALTER TABLE public.pre_application_profiles ENABLE ROW LEVEL SECURITY;
```

The change is additive. To undo it: `DROP TABLE public.pre_application_profiles;`
(this deletes any saved details).

## Retention

Students can delete their details at any time from the review screen. There is no
automatic purge yet; if one is wanted, ask Lovable to delete rows whose `updated_at`
is older than an agreed period (for example 180 days, matching counsellor requests)
inside the existing `purge_expired_growth_data()` job.
