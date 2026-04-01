# Engineering Conventions and Definition of Done

## Purpose

Define a consistent baseline for every slice so backend, frontend, and tests ship together.

## Repository structure

Expected top-level folders:

- `backend/` for API and domain implementation
- `frontend/` for UI implementation
- `tests/` for cross-cutting and integration tests
- `docs/` for product, design, and process documentation

## Coding conventions

- Prefer small, reviewable PRs that complete one issue/slice.
- Use explicit types and descriptive names.
- Keep functions focused and avoid hidden side effects.
- Add/update tests in the same PR as behavior changes.
- Document API request/response and error behavior for new endpoints.

## API conventions

- Version all endpoints under `/api/v1/`.
- Use cursor pagination for list endpoints.
- Return RFC 9457 Problem Details payloads for errors.
- Enforce authorization checks before all mutations.

## Slice Definition of Done

A slice is complete only when all checks below are true:

- [ ] Scope from issue is implemented end-to-end (API + UI when applicable).
- [ ] Permissions and validation rules are enforced.
- [ ] Tests are added/updated (`unit`, `integration`, and/or `e2e` as applicable).
- [ ] Docs are updated for any new behavior or contracts.
- [ ] PR checklist is fully completed.

## PR checklist policy

The pull request template is the source of truth for quality gates. Every PR must:

1. Link the issue being implemented.
2. Confirm API + UI + tests expectations.
3. Include a concrete test plan and execution evidence.
