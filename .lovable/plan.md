# Explore before you apply

Extend the existing FutureMe AI experience without changing its current design or replacing working student, referral, tracking, rate-limit, retention, or admin behavior.

## Build

1. Add a browser-safe NIAT fact sheet containing only the seven supplied facts, each linked to niatindia.com and verified on 2026-11-17.
2. Add private parent briefs and consented counsellor requests with row-level security, server-only brief reads, admin-only request reads, atomic parent-question limits, and 180-day counsellor-request retention.
3. Add same-origin, validated server endpoints for parent brief generation, grounded parent questions, and counsellor requests. Reuse the existing visitor session, generation limits, Anthropic structured-output pattern, event log, and first-touch referral attribution.
4. Add parent actions to generated project pages: create and share a brief, ask grounded questions, and request a counsellor call with explicit consent and a validated Indian mobile number. Deliver counsellor requests to the optional server-side webhook without exposing contact details to analytics.
5. Extend the existing event allow-lists and live admin report with the family funnel and qualified referrals. Link clicks alone will not qualify a referral.
6. Remove `.env` from git tracking while retaining the local file; `.gitignore` already contains the required environment rules. Update the README heading and document the new configuration.
7. Add focused tests for validation, prohibited outcome figures, question limits, consent, and referral qualification. Run existing and new tests, lint, build checks, and a browser/API flow; report anything that cannot be verified.

## Technical notes

- Apply one additive database migration through Lovable's migration tool and use its regenerated types.
- Keep all AI keys, webhook configuration, contact details, and privileged database access server-side.
- Preserve the existing referral system and event deduplication rather than adding parallel tracking.
