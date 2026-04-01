# Project Management System — Design Document

## Overview

A developer-focused issue tracking and project management system in the style of Linear/Jira. Built for software teams to track bugs, manage sprints, and ship projects.

**Stack:** React + TypeScript (Vite) · Java Spring Boot · PostgreSQL · REST API

---

## 1. Data Hierarchy

```
Organisation
└── Team
    ├── WorkflowState (custom statuses)
    ├── Label
    └── Project
        ├── Issue
        │   ├── Sub-issue (one level only)
        │   ├── Comment
        │   ├── Attachment
        │   ├── IssueLabel
        │   └── IssueActivity
        └── Cycle
            └── Issue (via cycle_id on Issue)
```

---

## 2. Entities & Fields

### Organisation
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | string | |
| slug | string | unique, used in URLs |
| issue_sequence | int | global auto-increment for issue numbers |
| created_at | timestamp | |

### User
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| email | string | unique, primary auth identifier |
| username | string | unique, used for @mentions |
| password_hash | string | bcrypt |
| avatar_url | string | nullable |
| timezone | string | e.g. Europe/London |
| created_at | timestamp | |
| updated_at | timestamp | |

### OrganisationMembership
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| organisation_id | UUID | FK → Organisation |
| user_id | UUID | FK → User |
| role | enum | `admin \| member` |

### Team
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| organisation_id | UUID | FK → Organisation |
| name | string | |
| identifier | string | short prefix e.g. ENG |
| created_at | timestamp | |

### TeamMembership
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| team_id | UUID | FK → Team |
| user_id | UUID | FK → User |
| role | enum | `owner \| member \| guest` |

### Project
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| team_id | UUID | FK → Team |
| lead_id | UUID | FK → User, nullable |
| name | string | |
| description | string | nullable |
| status | enum | `planning \| active \| completed \| cancelled` |
| start_date | date | nullable |
| target_date | date | nullable |
| icon | string | nullable |
| color | string | hex color |
| external_links | JSON | array of `{ label, url }` |
| deleted_at | timestamp | soft delete |
| created_at | timestamp | |
| updated_at | timestamp | |

### WorkflowState
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| team_id | UUID | FK → Team |
| name | string | custom e.g. "In Review" |
| color | string | hex color |
| type | enum | `backlog \| unstarted \| started \| completed \| cancelled` |
| position | int | display order |

### Issue
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| project_id | UUID | FK → Project |
| team_id | UUID | FK → Team (denormalised for query performance) |
| workflow_state_id | UUID | FK → WorkflowState |
| assignee_id | UUID | FK → User, nullable |
| reporter_id | UUID | FK → User |
| parent_id | UUID | FK → Issue, nullable — one level deep only |
| cycle_id | UUID | FK → Cycle, nullable — one active cycle at a time |
| sequence_number | int | org-scoped e.g. #42 |
| title | string | |
| description | text | nullable |
| priority | enum | `urgent \| high \| medium \| low \| none` |
| estimate | int | story points, nullable |
| due_date | date | nullable |
| deleted_at | timestamp | soft delete |
| created_at | timestamp | |
| updated_at | timestamp | |

**Constraints:**
- `parent_id` must reference an Issue where `parent_id IS NULL` (no nested sub-issues)
- `cycle_id` uniqueness enforced at application layer (one active cycle per issue at a time)

### Label
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| team_id | UUID | FK → Team |
| name | string | |
| color | string | hex color |

### IssueLabel
| Field | Type | Notes |
|---|---|---|
| issue_id | UUID | FK → Issue |
| label_id | UUID | FK → Label |

### Cycle
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| project_id | UUID | FK → Project |
| name | string | |
| description | string | nullable |
| status | enum | `draft \| active \| completed` |
| start_date | date | |
| end_date | date | |
| deleted_at | timestamp | soft delete |
| created_at | timestamp | |
| updated_at | timestamp | |

**Constraint:** Only one Cycle with status `active` per Project at a time.

Progress metrics (completed issues, velocity) are computed at query time, not stored — except velocity which is snapshotted on cycle completion.

### Comment
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| issue_id | UUID | FK → Issue |
| author_id | UUID | FK → User |
| body | text | |
| edited_at | timestamp | nullable |
| deleted_at | timestamp | soft delete — body replaced with "This comment was deleted" |
| created_at | timestamp | |

### IssueActivity
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| issue_id | UUID | FK → Issue |
| actor_id | UUID | FK → User |
| type | enum | `status_changed \| assignee_changed \| priority_changed \| cycle_changed \| label_changed \| title_changed \| estimate_changed \| due_date_changed \| comment_added \| attachment_added` |
| from_value | string | nullable |
| to_value | string | nullable |
| created_at | timestamp | append-only, never updated or deleted |

### Attachment
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| issue_id | UUID | FK → Issue |
| uploader_id | UUID | FK → User |
| filename | string | original filename |
| file_url | string | path/URL from storage service |
| file_size | int | bytes |
| mime_type | string | |
| created_at | timestamp | |

**Storage:** Abstracted behind a `StorageService` interface. Local filesystem implementation for dev, swappable to S3 via config for production.

### Notification
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| recipient_id | UUID | FK → User |
| actor_id | UUID | FK → User, nullable |
| issue_id | UUID | FK → Issue, nullable |
| type | enum | see notification events below |
| read_at | timestamp | nullable — null means unread |
| created_at | timestamp | |

### NotificationPreference
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → User |
| organisation_id | UUID | FK → Organisation |
| event_type | enum | see notification events below |
| channel | enum | `in_app \| email` |
| enabled | boolean | default true |

**Notification event types:** `issue_assigned`, `issue_mentioned`, `issue_status_changed`, `issue_commented`, `added_to_team`, `added_to_project`, `due_date_approaching`, `cycle_started`, `cycle_completed`, `sub_issue_created`

### ApiKey
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → User |
| key_hash | string | bcrypt hash of the raw key |
| label | string | user-defined name |
| last_used_at | timestamp | nullable |
| created_at | timestamp | |

---

## 3. Authorisation Model

Three-tier role system:

**Organisation level**
- `admin` — manage members, teams, billing, org settings
- `member` — standard access, can be added to teams

**Team level**
- `owner` — manage team settings, members, delete projects/issues
- `member` — create and edit issues, projects, cycles, comments
- `guest` — view only

Org admins have implicit owner rights on all teams within the organisation. Enforced via a `PermissionService` that resolves effective role by checking org membership first, then team membership.

| Action | Org Admin | Team Owner | Team Member | Team Guest |
|---|:---:|:---:|:---:|:---:|
| Create / delete team | ✓ | | | |
| Manage team members | ✓ | ✓ | | |
| Create / edit project | ✓ | ✓ | ✓ | |
| Create / edit issue | ✓ | ✓ | ✓ | |
| Comment on issue | ✓ | ✓ | ✓ | |
| Delete issue / project | ✓ | ✓ | | |
| View everything | ✓ | ✓ | ✓ | ✓ |

---

## 4. Authentication

- **Primary auth:** Email + password, bcrypt hashed
- **Session:** JWT access token (15 min) + refresh token (30 days), both stored in httpOnly cookies
- **API access:** Hashed API keys validated per-request via `Authorization: Bearer <key>` header
- **Spring Security:** Custom JWT filter on all `/api/v1/**` routes; separate filter for API key auth

---

## 5. REST API Design

### Versioning
All endpoints prefixed `/api/v1/`. Breaking changes introduce `/api/v2/` alongside existing version.

### Pagination
Cursor-based pagination on all list endpoints.

Request: `GET /api/v1/issues?cursor=eyJpZCI6Ij...&limit=25`

Response envelope:
```json
{
  "data": [...],
  "nextCursor": "eyJpZCI6Ij...",
  "hasMore": true
}
```

Cursor is a base64-encoded JSON of `{ "created_at": "...", "id": "..." }`. Default page size 25, max 100.

### Error format
RFC 9457 Problem Details:
```json
{
  "type": "https://yourapp.com/errors/not-found",
  "title": "Resource not found",
  "status": 404,
  "detail": "Issue #42 does not exist in this organisation",
  "instance": "/api/v1/issues/42"
}
```

Implemented via Spring Boot 3 `ProblemDetail` and a global `@ControllerAdvice` exception handler.

### Key endpoints

```
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

GET    /api/v1/organisations/:orgSlug
POST   /api/v1/organisations
GET    /api/v1/organisations/:orgSlug/members

GET    /api/v1/organisations/:orgSlug/teams
POST   /api/v1/organisations/:orgSlug/teams
GET    /api/v1/organisations/:orgSlug/teams/:teamId

GET    /api/v1/teams/:teamId/projects
POST   /api/v1/teams/:teamId/projects
GET    /api/v1/projects/:projectId
PATCH  /api/v1/projects/:projectId
DELETE /api/v1/projects/:projectId

GET    /api/v1/projects/:projectId/issues
POST   /api/v1/projects/:projectId/issues
GET    /api/v1/issues/:issueId
PATCH  /api/v1/issues/:issueId
DELETE /api/v1/issues/:issueId

GET    /api/v1/issues/:issueId/comments
POST   /api/v1/issues/:issueId/comments
PATCH  /api/v1/comments/:commentId
DELETE /api/v1/comments/:commentId

GET    /api/v1/issues/:issueId/attachments
POST   /api/v1/issues/:issueId/attachments
DELETE /api/v1/attachments/:attachmentId

GET    /api/v1/projects/:projectId/cycles
POST   /api/v1/projects/:projectId/cycles
GET    /api/v1/cycles/:cycleId
PATCH  /api/v1/cycles/:cycleId

GET    /api/v1/notifications
POST   /api/v1/notifications/:id/read
POST   /api/v1/notifications/read-all

GET    /api/v1/users/me
PATCH  /api/v1/users/me
GET    /api/v1/users/me/notification-preferences
PATCH  /api/v1/users/me/notification-preferences

GET    /api/v1/users/me/api-keys
POST   /api/v1/users/me/api-keys
DELETE /api/v1/users/me/api-keys/:keyId
```

---

## 6. Frontend Architecture

### Stack
- Vite + React + TypeScript
- React Router v6 (nested layouts)
- TanStack Query (server state, caching, pagination)
- Zustand (client state)
- Tailwind CSS

### URL structure
```
/                                          → redirect to last org
/:orgSlug/                                 → org dashboard
/:orgSlug/settings                         → org settings
/:orgSlug/:teamIdentifier/                 → team dashboard
/:orgSlug/:teamIdentifier/issues           → issue list
/:orgSlug/:teamIdentifier/issues/:number   → issue detail
/:orgSlug/:teamIdentifier/projects         → projects list
/:orgSlug/:teamIdentifier/projects/:id     → project detail
/:orgSlug/:teamIdentifier/cycles           → cycles list
/:orgSlug/:teamIdentifier/cycles/:id       → cycle detail
```

### State management
**Zustand — one global store** containing:
- Current user and auth state (JWT token, logged-in status)
- Active organisation and team context
- UI state (sidebar collapsed, active filters, theme)
- Server data cached in the store alongside client state

**TanStack Query** handles all API fetching, cache invalidation, and pagination for issues, projects, cycles, comments, and notifications.

### Layout hierarchy
`RootLayout` → `OrgLayout` (loads org context) → `TeamLayout` (loads team context) → page components. Each layout level fetches its own data via TanStack Query.

---

## 7. Backend Architecture

### Package structure
```
com.yourapp
├── controllers/       REST controllers, request/response DTOs
├── services/          Business logic
├── repositories/      Spring Data JPA repositories
├── entities/          JPA entity classes
├── dtos/              Request and response objects
├── exceptions/        Domain exceptions + global @ControllerAdvice
├── security/          JWT filter, API key filter, PermissionService
├── storage/           StorageService interface + local/S3 implementations
└── config/            Spring configuration classes
```

### Key Spring Boot patterns
- `@SQLRestriction("deleted_at IS NULL")` on soft-deleted entities (Issue, Project, Cycle, Comment) for automatic filtering
- `PermissionService` injected into controllers to resolve effective role before any mutation
- `StorageService` interface with `LocalStorageServiceImpl` (dev) and `S3StorageServiceImpl` (prod) switched via `@Profile`
- Global `@ControllerAdvice` mapping domain exceptions to RFC 9457 `ProblemDetail` responses

### Database
- **PostgreSQL** with JPA/Hibernate
- `spring.jpa.hibernate.ddl-auto=update` in dev, `validate` in production

---

## 8. Soft Deletes

Soft delete (`deleted_at` timestamp) applied to: **Issue, Project, Cycle, Comment**. Hard delete on all other entities.

Soft-deleted records are invisible by default via `@SQLRestriction`. Deleted comments display as "This comment was deleted" in the UI. Issues and projects can be recovered by an org admin or team owner.

---

## 9. Notifications

Delivered via two channels, both configurable per user per event type in `NotificationPreference`.

**In-app:** Polled on page load via `GET /api/v1/notifications`. Unread count displayed in nav. Mark read individually or all at once.

**Email:** Sent asynchronously. Email templates per event type.

No real-time delivery (no WebSockets or SSE). Notifications appear on next page load or refresh.

---

## 10. Testing Strategy

**Backend**
- JUnit 5 + Testcontainers — integration tests against a real PostgreSQL instance spun up per test suite
- Mockito — unit tests on service layer logic in isolation

**Frontend**
- Vitest + React Testing Library — component and hook unit tests

**End-to-end**
- Playwright — focused on critical user journeys: auth flow, creating an issue, moving it through a cycle, completing a cycle

---

## 11. Deployment & CI/CD

### Environments
- **Local:** Docker Compose running Spring Boot app + PostgreSQL + local file storage
- **Staging:** Cloud deployment, mirrors production config
- **Production:** Cloud deployment, S3 for file storage

### CI/CD — GitHub Actions
- On every PR: run backend tests (JUnit + Testcontainers) + frontend tests (Vitest) + Playwright E2E
- On merge to `main`: deploy to staging
- On tagged release (`v*`): deploy to production

### Docker
- `Dockerfile` for Spring Boot app (multi-stage build)
- `Dockerfile` for React frontend (Vite build → nginx)
- `docker-compose.yml` for local dev with hot reload

---

## 12. Key Design Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Issue parent | Project | Clean hierarchy, every issue has a project context |
| Cycle parent | Project | Each project manages its own sprints |
| Issue identifier | Org-scoped sequence (#42) | Simple global numbering |
| Sub-issue depth | One level only | Avoids UI and query complexity |
| Issue status | Custom per team, fixed type enum | Teams name freely, system understands semantics |
| Label scope | Per team | Reusable across projects, avoids duplication |
| Auth | JWT + refresh tokens in httpOnly cookies | Secure, standard |
| Pagination | Cursor-based | Reliable for live datasets |
| Error format | RFC 9457 Problem Details | Modern standard, native Spring Boot 3 support |
| Soft delete | Issues, Projects, Cycles, Comments only | Recoverable without full audit restore |
| Migrations | JPA auto DDL | Fast to start, path to production-grade |
| Notifications | In-app + email, fully configurable | No real-time complexity at this stage |
| Project structure | Package by layer | Familiar, easy to onboard |
| Storage | Abstracted StorageService | Local in dev, S3 in prod, zero code change |
