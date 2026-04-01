# CI/CD Quality Gates

## Pull request checks

The `CI and Staging` workflow runs on all PRs into `main` and executes:

- dependency install
- unit and integration tests (`npm test`)
- critical-path E2E suite (`npm run test:e2e`)

## Main branch promotion

When code merges to `main`, the same quality gates run, then `deploy-staging` executes.

## Required checks recommendation

Configure branch protection on `main` to require:

- `quality-gates`

This ensures merges are blocked unless all automated checks pass.
