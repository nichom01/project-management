# Security Hardening Checklist

## Auth and AuthZ checks

- [x] Session-based auth required for mutation routes.
- [x] Resource-scoped authorization for issue and cycle mutations.
- [x] Outsider/guest negative tests for protected mutations.

## Sensitive route protections

- [x] Issue update/delete/restore enforce team-aware access.
- [x] Cycle start/complete and cycle-issue assignment enforce team-aware access.

## Regression coverage

- [x] Integration tests cover unauthorized mutation attempts.
- [x] Full test suite passes after hardening changes.
