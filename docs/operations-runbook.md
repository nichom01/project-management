# Observability and Operations Runbook

## Baseline signals

- `GET /api/v1/health` returns service health and uptime.
- `GET /api/v1/metrics` returns request/error counters for quick triage.
- CI pipeline status is treated as a release health gate.

## Alert smoke checks

1. Verify health endpoint returns `status: ok`.
2. Generate a known 4xx/5xx path and confirm `errorsTotal` increments.
3. Confirm logs include failing route and request timestamp.

## Top incident scenarios

### 1) Auth failures spike

- Validate cookie/session expiration behavior.
- Check login and refresh error rates.
- Roll back to previous build if auth regression is confirmed.

### 2) Cycle operations failing

- Check single-active-cycle conflicts vs true failures.
- Verify issue/cycle authorization paths for role regressions.
- Use rollback plan if widespread 5xx or authz drift appears.

### 3) Notification delivery gaps

- Confirm in-app notification queue behavior.
- Process email queue and inspect outbox for stuck deliveries.
- Verify user preference toggles are not disabling expected events.

## On-call response steps

1. Detect alert and classify severity.
2. Acknowledge incident in release channel.
3. Triage via health/metrics/logs and reproduce quickly.
4. Mitigate (rollback or hotfix), then verify key journeys.
5. Publish incident summary and follow-up actions.
