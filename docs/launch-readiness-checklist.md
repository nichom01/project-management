# Launch Readiness Checklist

## Go / No-Go Criteria

- [x] CI quality gates (`quality-gates`) are green on latest `main`.
- [x] Critical path E2E flow passes in CI.
- [x] Security hardening checklist completed (`docs/security-checklist.md`).
- [x] UAT walkthrough completed for auth, issue lifecycle, cycle workflow, notifications.

## Rollback Plan

1. Stop new rollout traffic to staging/production target.
2. Re-deploy previous known-good build artifact.
3. Validate health endpoints and smoke test key flows.
4. Re-open incident channel and communicate rollback completion.

## Communication Plan

- **Pre-launch:** Share release notes and risk callouts with stakeholders.
- **During launch:** Post status updates every 15 minutes in release channel.
- **Post-launch:** Publish success/failure summary and follow-up actions.

## Dry Run Validation

- [x] Dry-run checklist rehearsal completed in staging.
- [x] Rollback rehearsal executed and timed.
- [x] Owner assignment confirmed for launch commander, QA verifier, and comms lead.
