# FutureMe Family: Growth Hack Challenge submission

**Track B: Bottom of Funnel (warm NIAT prospects).** Positioning: _Explore first. Decide together._

Live app: https://future-me-discovery-garden.lovable.app/

## 1. Growth opportunity and journey audit

Warm prospects already know NIAT. The drop-off we target sits between "interested" and
"application submitted", where the decision is usually a family one. The standard
follow-up speaks to the student; parents get second-hand information and have open
questions (is it a university? what will my child actually do? who do I ask?).

| Journey step          | Friction today                         | FutureMe Family answer                                              |
| --------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| Student is curious    | Abstract programme pages               | Five-step discovery → a personalised AI-generated project           |
| "What would I build?" | Nothing tangible                       | Interactive demo (curated, rule-based samples, labelled as such)    |
| Family conversation   | Parent lacks clear, honest information | Parent Brief in English / हिन्दी / తెలుగు + grounded Parent Q&A       |
| Open questions        | Hard to reach the right person         | Consented counsellor callback request                               |
| Application           | Re-typing details, unclear next step   | Saved pre-application details + tracked link to the official portal |
| Counsellor follow-up  | No context on what the family did      | `/counsellor` workspace with engagement signals                     |

## 2. Experiment

- **Control:** standard NIAT follow-up.
- **Treatment:** standard follow-up + a FutureMe Family link (campaign `futureme_family_warmlead_test`).
- **Audience:** about 200 warm prospects and families, randomly split outside the app.
- **Hypothesis:** families who receive FutureMe Family alongside standard follow-up complete
  more NIAT applications than families receiving standard follow-up alone.
- **Primary metric:** completed applications, reconciled from NIAT admissions records
  (the app cannot see these).
- **Leading indicators (in-app, treatment only):** discovery completion, successful AI
  generation, Parent Brief generation/opening, parent questions, counsellor requests,
  application-link clicks. An application-link click is **not** a submitted application.

**Proposed pilot decision rule (an assumption, not a result):** continue to a larger test if
the treatment group's completed-application rate is at least 5 percentage points above
control with no increase in counsellor complaints. With about 100 per arm this is a
directional pilot only; it cannot establish statistical significance.

No experiment results exist yet.

## 3. Components and AI

- Connected components: discovery → AI project generation (saved in Supabase) → demo →
  Parent Brief → Parent Q&A → counsellor request / saved application details →
  `/counsellor` CRM and `/admin` growth dashboard.
- Real AI: server-side Anthropic calls for project generation, Parent Briefs and Parent Q&A.
- Three genuine agent-callable tools in Parent Q&A (`src/lib/parent-question.server.ts`):
  `get_saved_project`, `get_parent_brief`, `get_verified_niat_facts`. The model requests
  them with `tool_use`, the server runs them and returns `tool_result` blocks, and an
  answer is accepted only after all three results have been returned.

## 4. Three-minute Loom script

1. **0:00–0:20 Problem.** "Warm NIAT prospects decide with their families. Parents often
   lack clear, honest information. FutureMe Family: explore first, decide together."
2. **0:20–0:55 Student.** Open the campaign link, complete the five-step discovery, show
   the AI-generated project being created and saved.
3. **0:55–1:15 Demo.** Click through the interactive demo; say that it is a curated sample.
4. **1:15–1:55 Family.** Generate a Hindi or Telugu Parent Brief. Ask a parent question;
   point out that the answer is grounded by three tools (project, brief, verified NIAT facts).
5. **1:55–2:20 Next step.** Request a counsellor call (consent + masked phone later).
   Save application details, review, copy, then open the official portal. Say clearly
   that nothing is submitted automatically.
6. **2:20–2:45 Team view.** `/counsellor`: lead list, engagement tier, follow-ups, activity
   history, masked phone with separate reveal. `/admin`: funnel.
7. **2:45–3:00 Experiment.** Control vs treatment, the hypothesis, and that real
   applications are reconciled with NIAT records.

## 5. Reflection

**What worked**

- Grounding parent answers in tool results from a seven-fact verified sheet kept claims honest.
- Server-only secrets, hashed visitor cookies and RLS kept personal data out of the browser
  and analytics.
- Counsellors get context (what the family actually did) instead of a bare phone number.

**What did not / limitations**

- No experiment has run, so there are no outcome numbers.
- Engagement tiers describe behaviour; they do not predict admission.
- The official portal cannot be pre-filled: there is no authorised NIAT API, so details
  are copied by hand.
- A Parent Brief opening does not prove a parent opened it; a share does not prove delivery.

**Next steps**

1. Run the 200-prospect pilot and reconcile applications with NIAT admissions records.
2. If NIAT offers an authorised intake API, replace copy/paste with a consented hand-off.
3. Add an automatic retention period for saved pre-application details.

## 6. Manual setup still required

1. Ask Lovable to create the `pre_application_profiles` table
   ([docs/pre-application-profile.md](pre-application-profile.md)). Until then the form
   says it is not switched on yet; everything else works.
2. Provision counsellors and admins with the SQL in
   [docs/counsellor-workspace.md](counsellor-workspace.md) and the README.
3. Confirm `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `VISITOR_HASH_SALT` are set
   in Lovable Secrets (never in the repo).
4. Publish from Lovable after the GitHub push and re-check the live site.
