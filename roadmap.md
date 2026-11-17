# FutureMe AI

- [x] Create the design system and illustrated landing page.
- [x] Build the discovery wizard and sample project results with interactive demos.
- [x] Add project exploration, showcase, sharing, referral invitation, and NIAT actions.
- [x] Create the clearly labeled demo analytics dashboard.
- [x] Verify navigation, discovery, demos, and mobile layout; commit changes.
- [x] Provision the Cloud database: seeded project catalog, discovery journeys, saved projects, shares, invitations and invitation visits, NIAT interest notes, site visits, admin roles.
- [x] Generate real AI projects from the five discovery answers, save them, and open them by link.
- [x] Point AI generation at Anthropic's API directly and restrict saved projects to the site's own server-side reads.
- [ ] Wire the app surfaces to the database: record journeys, saves, shares and visits; show real dashboard numbers; add sign-in and admin access for the dashboard.

## Growth engine brief (Nov 2026)

- [x] Phase 1: Remove unused AI packages; Anthropic SDK only
- [x] Phase 2: Per-visitor limit (3/15 min) + configurable global caps, atomic in database
- [x] Phase 3: Saved projects readable only by the server (done earlier)
- [x] Phase 4: Real event tracking with campaign attribution
- [x] Phase 5: Referral codes and referral visit attribution
- [ ] Phase 6: NxtWave learning pathway section + inquiry form (needs real NxtWave links and privacy notice)
- [x] Phase 7: Real growth dashboard replacing demo numbers
- [x] Phase 8: Admin sign-in with server-side role checks
- [ ] Assign the first admin (waiting on the admin's email from the owner)
- [ ] Phase 9: Privacy, retention and data quality
- [ ] Phase 10: Full test pass

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

- [ ] Add the verified NIAT fact sheet and private parent briefs.
- [ ] Add grounded parent Q&A with per-brief visitor limits.
- [ ] Add consented counsellor requests, webhook delivery and retention.
- [ ] Extend tracking, referral qualification and the live family dashboard.
- [ ] Complete housekeeping, regression tests and end-to-end verification.
