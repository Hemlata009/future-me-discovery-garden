# FutureMe AI

- [x] Create the design system and illustrated landing page.
- [x] Build the discovery wizard and sample project results with interactive demos.
- [x] Add project exploration, showcase, sharing, referral invitation, and NIAT actions.
- [x] Create the clearly labeled demo analytics dashboard.
- [x] Verify navigation, discovery, demos, and mobile layout; commit changes.
- [x] Provision the Cloud database: seeded project catalog, discovery journeys, saved projects, shares, invitations and invitation visits, NIAT interest notes, site visits, admin roles.
- [x] Generate real AI projects from the five discovery answers, save them, and open them by link.
- [x] Point AI generation at Anthropic's API directly and restrict saved projects to the site's own server-side reads.
- [x] Wire the app surfaces to the database: record journeys, saves, shares and visits; show real dashboard numbers; add sign-in and admin access for the dashboard.

## Growth engine brief (Nov 2026)

- [x] Phase 1: Remove unused AI packages; Anthropic SDK only
- [x] Phase 2: Per-visitor limit (3/15 min) + configurable global caps, atomic in database
- [x] Phase 3: Saved projects readable only by the server (done earlier)
- [x] Phase 4: Real event tracking with campaign attribution
- [x] Phase 5: Referral codes and referral visit attribution
- [x] Phase 6: NxtWave learning pathway section + consented counsellor request with privacy notice
- [x] Phase 7: Real growth dashboard replacing demo numbers
- [x] Phase 8: Admin sign-in with server-side role checks
- [ ] Assign the first admin (waiting on the admin's email from the owner)
- [x] Phase 9: Privacy, retention and data quality
- [x] Phase 10: Full test pass

## Targeted corrections (Nov 15)

- [x] Entry-page visitor tracking on all public routes
- [x] /api/track returns 503/429 honestly; client checks status
- [x] Separate NIAT modal opens vs outbound clicks
- [x] Cohort-consistent segmented funnel + utm source/medium/campaign filters
- [x] Share-action labels
- [x] Complete generation outcome events
- [x] Hardening: salt required in prod, retention, invite-only admin accounts
- [x] Tests

## Explore before you apply (Nov 17)

- [x] Add the verified NIAT fact sheet and private parent briefs.
- [x] Add grounded parent Q&A with per-brief visitor limits.
- [x] Add consented counsellor requests, optional webhook delivery and 180-day retention.
- [x] Extend tracking, referral qualification and the live family dashboard.
- [x] Complete housekeeping, regression tests and end-to-end verification.

## Decision journey UI (Nov 17)

- [x] Add the NIAT first-year card and four-action decision card to generated projects.
- [x] Add the shareable /parent route with grounded Q&A, consent form, referral sharing and noindex metadata.
- [x] Support discovery campaign links and the pre-application guidance banner.
- [x] Verify the fresh discovery-to-admin journey, tests, lint and build.

## Counsellor request hardening (Nov 17)

- [x] Add atomic visitor/site limits, duplicate protection, and slot release.
- [x] Track webhook delivery and show undelivered requests in the admin family funnel.
- [x] Document server-only counsellor settings and confirm environment ignore rules/template.
- [ ] Remove `.env` from git tracking (blocked: the sandbox refuses untracking it).
- [x] Add regression tests; run the full suite, changed-file lint, build, and live verification.

## Explore-before-you-apply UI polish (Nov 17)

- [x] Honesty footer, dismissible entry banner, decision card hierarchy.
- [x] Parent brief creation states, /parent layout, scripts, states and a11y.
- [x] Admin funnel mobile overflow; verify journey, tests, lint, build.

## Shared-link journey fixes (Nov 17)

- [x] Add shared UTM-tagged NIAT application links on the project and parent pages.
- [x] Localize friend-invite dialog and share messages in English, Hindi and Telugu.
- [x] Audit referred-project entry and add a referral-only discovery action if needed.
- [x] Add regression tests; run the full suite, changed-file lint, build and browser verification.
