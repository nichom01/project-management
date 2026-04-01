const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const { assertAllowed } = require("./permission-service");
const { paginate } = require("./pagination");
const { createProblem, appError, problemDetailsMiddleware } = require("./problem-details");
const { createStorageService } = require("./storage-service");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static("frontend"));

const metrics = {
  requestsTotal: 0,
  requestsByPath: {},
  errorsTotal: 0,
};

app.use((req, res, next) => {
  metrics.requestsTotal += 1;
  metrics.requestsByPath[req.path] = (metrics.requestsByPath[req.path] || 0) + 1;
  next();
});

const accessCookieName = "pm_access";
const refreshCookieName = "pm_refresh";
const accessSessions = new Map();
const refreshSessions = new Map();

const users = [
  {
    id: "u-1",
    email: "admin@example.com",
    password: "password123",
    name: "Admin User",
  },
  {
    id: "u-2",
    email: "member@example.com",
    password: "password123",
    name: "Team Member",
  },
  {
    id: "u-3",
    email: "guest@example.com",
    password: "password123",
    name: "Team Guest",
  },
  {
    id: "u-4",
    email: "outsider@example.com",
    password: "password123",
    name: "Outsider User",
  },
];

const orgMemberships = new Map([
  ["u-1", { orgRole: "admin" }],
  ["u-2", { orgRole: "member" }],
  ["u-3", { orgRole: "member" }],
  ["u-4", { orgRole: "member" }],
]);

const teamMemberships = new Map([
  ["team-1:u-1", { teamRole: "owner" }],
  ["team-1:u-2", { teamRole: "member" }],
  ["team-1:u-3", { teamRole: "guest" }],
]);

const projects = Array.from({ length: 120 }, (_, i) => ({
  id: `project-${i + 1}`,
  teamId: "team-1",
  name: `Project ${i + 1}`,
  status: "planning",
  leadId: null,
  startDate: null,
  targetDate: null,
  icon: null,
  color: null,
  externalLinks: [],
  archivedAt: null,
}));
const organisations = [];
const teams = [{ id: "team-1", orgId: "org-0", name: "Default Team", identifier: "ENG" }];
const labels = [{ id: "label-1", teamId: "team-1", name: "bug", color: "#ef4444" }];
const workflowStates = [
  { id: "state-1", teamId: "team-1", name: "Backlog", type: "backlog", position: 1, color: "#6b7280" },
  { id: "state-2", teamId: "team-1", name: "In Progress", type: "started", position: 2, color: "#2563eb" },
  { id: "state-3", teamId: "team-1", name: "Done", type: "completed", position: 3, color: "#16a34a" },
];
const workflowSemanticTypes = new Set(["backlog", "unstarted", "started", "completed", "cancelled"]);
const issues = [];
const issueActivities = [];
const cycles = [];
const comments = [];
const attachments = [];
const storageService = createStorageService();
const notifications = [];
const notificationPreferences = [];
const emailQueue = [];
const emailOutbox = [];

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: maxAgeMs,
  };
}

function setSessionCookies(res, userId) {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  const now = Date.now();

  accessSessions.set(accessToken, {
    userId,
    expiresAt: now + 15 * 60 * 1000,
  });

  refreshSessions.set(refreshToken, {
    userId,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
  });

  res.cookie(accessCookieName, accessToken, cookieOptions(15 * 60 * 1000));
  res.cookie(refreshCookieName, refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));
}

function clearSessionCookies(res) {
  res.clearCookie(accessCookieName, { path: "/" });
  res.clearCookie(refreshCookieName, { path: "/" });
}

function requireAuth(req, res, next) {
  const accessToken = req.cookies[accessCookieName];
  const session = accessSessions.get(accessToken);
  if (!accessToken || !session || session.expiresAt <= Date.now()) {
    return res.status(401).json(
      createProblem({
        type: "https://project-management/errors/auth-required",
        title: "Authentication required",
        status: 401,
        detail: "Login required for this action",
        instance: req.path,
      }),
    );
  }
  req.userId = session.userId;
  return next();
}

function authorize(action) {
  return (req, res, next) => {
    const org = orgMemberships.get(req.userId) || { orgRole: "member" };
    const key = `${req.params.teamId || "team-1"}:${req.userId}`;
    const team = teamMemberships.get(key) || { teamRole: "guest" };
    const result = assertAllowed(action, org.orgRole, team.teamRole);
    if (!result.allowed) {
      return res.status(403).json(
        createProblem({
          type: "https://project-management/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: `Role ${result.effectiveRole} cannot perform ${action}`,
          instance: req.path,
        }),
      );
    }
    req.effectiveRole = result.effectiveRole;
    return next();
  };
}

function authorizeForTeam(action, teamId, userId) {
  const org = orgMemberships.get(userId) || { orgRole: "member" };
  const team = teamMemberships.get(`${teamId}:${userId}`) || { teamRole: "guest" };
  return assertAllowed(action, org.orgRole, team.teamRole);
}

function authorizeIssueAction(action) {
  return (req, res, next) => {
    const issue = findIssueById(req.params.issueId);
    if (!issue) {
      return next(
        appError({
          type: "https://project-management/errors/not-found",
          title: "Resource not found",
          status: 404,
          detail: "Issue not found",
        }),
      );
    }
    const result = authorizeForTeam(action, issue.teamId, req.userId);
    if (!result.allowed) {
      return next(
        appError({
          type: "https://project-management/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: `Role ${result.effectiveRole} cannot perform ${action}`,
        }),
      );
    }
    req.issue = issue;
    return next();
  };
}

function authorizeCycleAction(action) {
  return (req, res, next) => {
    const cycle = findCycleById(req.params.cycleId);
    if (!cycle) {
      return next(
        appError({
          type: "https://project-management/errors/not-found",
          title: "Resource not found",
          status: 404,
          detail: "Cycle not found",
        }),
      );
    }
    const project = findProjectById(cycle.projectId);
    if (!project) {
      return next(
        appError({
          type: "https://project-management/errors/not-found",
          title: "Resource not found",
          status: 404,
          detail: "Project not found",
        }),
      );
    }
    const result = authorizeForTeam(action, project.teamId, req.userId);
    if (!result.allowed) {
      return next(
        appError({
          type: "https://project-management/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: `Role ${result.effectiveRole} cannot perform ${action}`,
        }),
      );
    }
    req.cycle = cycle;
    return next();
  };
}

function findProjectById(projectId) {
  return projects.find((project) => project.id === projectId);
}

function findIssueById(issueId) {
  return issues.find((issue) => issue.id === issueId);
}

function findCycleById(cycleId) {
  return cycles.find((cycle) => cycle.id === cycleId);
}

function createNotification({ recipientId, actorId, type, issueId = null }) {
  const inAppPref = notificationPreferences.find(
    (pref) => pref.userId === recipientId && pref.eventType === type && pref.channel === "in_app",
  );
  if (inAppPref && inAppPref.enabled === false) {
    return;
  }
  notifications.push({
    id: `notification-${notifications.length + 1}`,
    recipientId,
    actorId,
    issueId,
    type,
    readAt: null,
    createdAt: new Date().toISOString(),
  });
  const emailPref = notificationPreferences.find(
    (pref) => pref.userId === recipientId && pref.eventType === type && pref.channel === "email",
  );
  if (!emailPref || emailPref.enabled !== false) {
    emailQueue.push({
      id: `email-${emailQueue.length + 1}`,
      recipientId,
      type,
      issueId,
      attempts: 0,
      status: "queued",
      lastError: null,
      template: `email-template:${type}`,
      createdAt: new Date().toISOString(),
    });
  }
}

function processEmailQueue() {
  for (const item of emailQueue) {
    if (item.status === "sent") {
      continue;
    }
    item.attempts += 1;
    // Simulate a transient provider failure for first attempt.
    if (item.attempts === 1) {
      item.status = "retrying";
      item.lastError = "Transient provider timeout";
      continue;
    }
    item.status = "sent";
    item.lastError = null;
    emailOutbox.push({
      id: `outbox-${emailOutbox.length + 1}`,
      recipientId: item.recipientId,
      type: item.type,
      template: item.template,
      sentAt: new Date().toISOString(),
    });
  }
}

function authorizeProject(action) {
  return (req, res) => {
    const project = findProjectById(req.params.projectId);
    if (!project) {
      return res.status(404).json(
        createProblem({
          type: "https://project-management/errors/not-found",
          title: "Resource not found",
          status: 404,
          detail: "Project not found",
          instance: req.path,
        }),
      );
    }
    const org = orgMemberships.get(req.userId) || { orgRole: "member" };
    const team = teamMemberships.get(`${project.teamId}:${req.userId}`) || { teamRole: "guest" };
    const result = assertAllowed(action, org.orgRole, team.teamRole);
    if (!result.allowed) {
      return res.status(403).json(
        createProblem({
          type: "https://project-management/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: `Role ${result.effectiveRole} cannot perform ${action}`,
          instance: req.path,
        }),
      );
    }
    req.project = project;
    req.effectiveRole = result.effectiveRole;
    return null;
  };
}

function slugify(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

app.post("/api/v1/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = users.find((u) => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).json(
      createProblem({
        type: "https://project-management/errors/auth-invalid",
        title: "Invalid credentials",
        status: 401,
        detail: "Email or password is incorrect",
        instance: "/api/v1/auth/login",
      }),
    );
  }

  setSessionCookies(res, user.id);
  return res.status(200).json({ id: user.id, email: user.email, name: user.name });
});

app.post("/api/v1/auth/refresh", (req, res) => {
  const refreshToken = req.cookies[refreshCookieName];
  const existing = refreshSessions.get(refreshToken);

  if (!refreshToken || !existing || existing.expiresAt <= Date.now()) {
    clearSessionCookies(res);
    if (refreshToken) {
      refreshSessions.delete(refreshToken);
    }
    return res.status(401).json(
      createProblem({
        type: "https://project-management/errors/auth-refresh-invalid",
        title: "Refresh token invalid",
        status: 401,
        detail: "Session is expired or invalid. Login again.",
        instance: "/api/v1/auth/refresh",
      }),
    );
  }

  refreshSessions.delete(refreshToken);
  const oldAccessToken = req.cookies[accessCookieName];
  if (oldAccessToken) {
    accessSessions.delete(oldAccessToken);
  }
  setSessionCookies(res, existing.userId);
  return res.status(200).json({ ok: true });
});

app.post("/api/v1/auth/logout", (req, res) => {
  const refreshToken = req.cookies[refreshCookieName];
  const accessToken = req.cookies[accessCookieName];
  if (refreshToken) {
    refreshSessions.delete(refreshToken);
  }
  if (accessToken) {
    accessSessions.delete(accessToken);
  }
  clearSessionCookies(res);
  return res.status(200).json({ ok: true });
});

app.get("/api/v1/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/v1/metrics", requireAuth, (req, res) => {
  return res.status(200).json(metrics);
});

app.post("/api/v1/teams/:teamId/projects", requireAuth, authorize("create_project"), (req, res) => {
  const project = {
    id: `project-${projects.length + 1}`,
    teamId: req.params.teamId,
    name: (req.body && req.body.name) || "Untitled",
    status: (req.body && req.body.status) || "planning",
    leadId: (req.body && req.body.leadId) || null,
    startDate: (req.body && req.body.startDate) || null,
    targetDate: (req.body && req.body.targetDate) || null,
    icon: (req.body && req.body.icon) || null,
    color: (req.body && req.body.color) || null,
    externalLinks: (req.body && req.body.externalLinks) || [],
    archivedAt: null,
    createdBy: req.userId,
    roleUsed: req.effectiveRole,
  };
  projects.push(project);
  return res.status(201).json(project);
});

app.post("/api/v1/projects/:projectId/issues", requireAuth, authorize("edit_project"), (req, res, next) => {
  const project = findProjectById(req.params.projectId);
  if (!project) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Project not found",
      }),
    );
  }
  const title = (req.body && req.body.title) || "";
  if (!title.trim()) {
    return next(
      appError({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "Issue title is required",
      }),
    );
  }
  const issue = {
    id: `issue-${issues.length + 1}`,
    projectId: project.id,
    teamId: project.teamId,
    title: title.trim(),
    description: (req.body && req.body.description) || "",
    assigneeId: (req.body && req.body.assigneeId) || null,
    reporterId: req.userId,
    priority: (req.body && req.body.priority) || "none",
    estimate: (req.body && req.body.estimate) || null,
    dueDate: (req.body && req.body.dueDate) || null,
    status: (req.body && req.body.status) || "backlog",
    parentId: (req.body && req.body.parentId) || null,
    cycleId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };
  if (issue.parentId) {
    const parent = findIssueById(issue.parentId);
    if (!parent) {
      return next(
        appError({
          type: "https://project-management/errors/validation",
          title: "Validation failed",
          status: 400,
          detail: "parentId must reference an existing issue",
        }),
      );
    }
    if (parent.parentId) {
      return next(
        appError({
          type: "https://project-management/errors/validation",
          title: "Validation failed",
          status: 400,
          detail: "Nested sub-issues are not allowed",
        }),
      );
    }
  }
  issues.push(issue);
  if (issue.assigneeId) {
    createNotification({
      recipientId: issue.assigneeId,
      actorId: req.userId,
      type: "issue_assigned",
      issueId: issue.id,
    });
  }
  return res.status(201).json(issue);
});

app.patch("/api/v1/issues/:issueId", requireAuth, authorizeIssueAction("edit_project"), (req, res, next) => {
  const issue = req.issue;
  const fields = ["title", "description", "assigneeId", "priority", "status", "estimate", "dueDate"];
  for (const field of fields) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, field)) {
      if (field === "priority" && !["urgent", "high", "medium", "low", "none"].includes(req.body[field])) {
        return next(
          appError({
            type: "https://project-management/errors/validation",
            title: "Validation failed",
            status: 400,
            detail: "Invalid priority",
          }),
        );
      }
      if (field === "estimate" && req.body[field] !== null) {
        const estimate = Number(req.body[field]);
        if (!Number.isInteger(estimate) || estimate < 0) {
          return next(
            appError({
              type: "https://project-management/errors/validation",
              title: "Validation failed",
              status: 400,
              detail: "Estimate must be a non-negative integer",
            }),
          );
        }
      }
      if (field === "dueDate" && req.body[field] !== null) {
        const dueDateValue = String(req.body[field]);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateValue)) {
          return next(
            appError({
              type: "https://project-management/errors/validation",
              title: "Validation failed",
              status: 400,
              detail: "dueDate must be YYYY-MM-DD",
            }),
          );
        }
      }
      const fromValue = issue[field];
      issue[field] = req.body[field];
      if (["status", "assigneeId", "priority", "estimate", "dueDate", "title"].includes(field) && fromValue !== issue[field]) {
        const typeMap = {
          status: "status_changed",
          assigneeId: "assignee_changed",
          priority: "priority_changed",
          estimate: "estimate_changed",
          dueDate: "dueDate_changed",
          title: "title_changed",
        };
        issueActivities.push({
          id: `activity-${issueActivities.length + 1}`,
          issueId: issue.id,
          actorId: req.userId,
          type: typeMap[field],
          fromValue: fromValue == null ? null : String(fromValue),
          toValue: issue[field] == null ? null : String(issue[field]),
          createdAt: new Date().toISOString(),
        });
      }
    }
  }
  issue.updatedAt = new Date().toISOString();
  return res.status(200).json(issue);
});

app.get("/api/v1/issues/:issueId", requireAuth, (req, res, next) => {
  const issue = findIssueById(req.params.issueId);
  if (!issue || (issue.deletedAt && req.query.includeDeleted !== "true")) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Issue not found",
      }),
    );
  }
  const children = issues.filter((item) => item.parentId === issue.id && !item.deletedAt);
  return res.status(200).json({ ...issue, subIssues: children });
});

app.get("/api/v1/projects/:projectId/issues", requireAuth, (req, res, next) => {
  const project = findProjectById(req.params.projectId);
  if (!project) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Project not found",
      }),
    );
  }
  const view = String(req.query.view || "table");
  let projectIssues = issues.filter((issue) => issue.projectId === project.id && !issue.deletedAt);
  const status = String(req.query.status || "").trim().toLowerCase();
  if (status) {
    projectIssues = projectIssues.filter((issue) => String(issue.status || "").toLowerCase() === status);
  }
  const page = paginate(projectIssues, req.query.cursor, req.query.limit);
  if (view === "board") {
    const lanes = {};
    for (const issue of page.data) {
      lanes[issue.status] = lanes[issue.status] || [];
      lanes[issue.status].push(issue);
    }
    return res.status(200).json({ view: "board", lanes, hasMore: page.hasMore, nextCursor: page.nextCursor });
  }
  return res.status(200).json({ view: "table", ...page });
});

app.post("/api/v1/issues/:issueId/transition", requireAuth, authorizeIssueAction("edit_project"), (req, res, next) => {
  const issue = req.issue;
  const toStatus = (req.body && req.body.toStatus) || "";
  if (!toStatus) {
    return next(
      appError({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "toStatus is required",
      }),
    );
  }
  const fromStatus = issue.status;
  issue.status = toStatus;
  issue.updatedAt = new Date().toISOString();
  issueActivities.push({
    id: `activity-${issueActivities.length + 1}`,
    issueId: issue.id,
    actorId: req.userId,
    type: "status_changed",
    fromValue: fromStatus,
    toValue: toStatus,
    createdAt: new Date().toISOString(),
  });
  return res.status(200).json(issue);
});

app.get("/api/v1/issues/:issueId/activity", requireAuth, (req, res) => {
  const feed = issueActivities
    .filter((item) => item.issueId === req.params.issueId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return res.status(200).json(feed);
});

app.get("/api/v1/issues/:issueId/comments", requireAuth, (req, res) => {
  const issueComments = comments
    .filter((comment) => comment.issueId === req.params.issueId)
    .map((comment) =>
      comment.deletedAt
        ? { ...comment, body: "This comment was deleted" }
        : comment,
    );
  return res.status(200).json(issueComments);
});

app.post("/api/v1/issues/:issueId/comments", requireAuth, authorize("edit_project"), (req, res, next) => {
  const issue = findIssueById(req.params.issueId);
  if (!issue || issue.deletedAt) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Issue not found",
      }),
    );
  }
  const body = (req.body && req.body.body) || "";
  if (!body.trim()) {
    return next(
      appError({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "Comment body is required",
      }),
    );
  }
  const comment = {
    id: `comment-${comments.length + 1}`,
    issueId: issue.id,
    authorId: req.userId,
    body: body.trim(),
    editedAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };
  comments.push(comment);
  return res.status(201).json(comment);
});

app.get("/api/v1/notifications", requireAuth, (req, res) => {
  const mine = notifications
    .filter((item) => item.recipientId === req.userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return res.status(200).json({
    data: mine,
    unreadCount: mine.filter((item) => !item.readAt).length,
  });
});

app.post("/api/v1/notifications/:id/read", requireAuth, (req, res, next) => {
  const notification = notifications.find((item) => item.id === req.params.id && item.recipientId === req.userId);
  if (!notification) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Notification not found",
      }),
    );
  }
  notification.readAt = new Date().toISOString();
  return res.status(200).json(notification);
});

app.post("/api/v1/notifications/read-all", requireAuth, (req, res) => {
  const now = new Date().toISOString();
  notifications.forEach((item) => {
    if (item.recipientId === req.userId && !item.readAt) {
      item.readAt = now;
    }
  });
  return res.status(200).json({ ok: true });
});

app.post("/api/v1/dev/email-queue/process", requireAuth, (req, res) => {
  processEmailQueue();
  return res.status(200).json({
    queued: emailQueue.length,
    sent: emailQueue.filter((item) => item.status === "sent").length,
    retrying: emailQueue.filter((item) => item.status === "retrying").length,
  });
});

app.get("/api/v1/dev/email-outbox", requireAuth, (req, res) => {
  return res.status(200).json(emailOutbox);
});

app.get("/api/v1/users/me/notification-preferences", requireAuth, (req, res) => {
  return res.status(200).json(
    notificationPreferences.filter((pref) => pref.userId === req.userId),
  );
});

app.patch("/api/v1/users/me/notification-preferences", requireAuth, (req, res, next) => {
  const preferences = (req.body && req.body.preferences) || [];
  if (!Array.isArray(preferences)) {
    return next(
      appError({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "preferences array is required",
      }),
    );
  }
  for (const pref of preferences) {
    const { eventType, channel, enabled } = pref || {};
    if (!eventType || !["in_app", "email"].includes(channel) || typeof enabled !== "boolean") {
      return next(
        appError({
          type: "https://project-management/errors/validation",
          title: "Validation failed",
          status: 400,
          detail: "Each preference requires eventType, channel, and boolean enabled",
        }),
      );
    }
    const existing = notificationPreferences.find(
      (item) => item.userId === req.userId && item.eventType === eventType && item.channel === channel,
    );
    if (existing) {
      existing.enabled = enabled;
      existing.updatedAt = new Date().toISOString();
    } else {
      notificationPreferences.push({
        id: `pref-${notificationPreferences.length + 1}`,
        userId: req.userId,
        eventType,
        channel,
        enabled,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  return res.status(200).json(
    notificationPreferences.filter((pref) => pref.userId === req.userId),
  );
});

app.patch("/api/v1/comments/:commentId", requireAuth, authorize("edit_project"), (req, res, next) => {
  const comment = comments.find((item) => item.id === req.params.commentId);
  if (!comment || comment.deletedAt) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Comment not found",
      }),
    );
  }
  const body = (req.body && req.body.body) || "";
  if (!body.trim()) {
    return next(
      appError({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "Comment body is required",
      }),
    );
  }
  comment.body = body.trim();
  comment.editedAt = new Date().toISOString();
  return res.status(200).json(comment);
});

app.delete("/api/v1/comments/:commentId", requireAuth, authorize("edit_project"), (req, res, next) => {
  const comment = comments.find((item) => item.id === req.params.commentId);
  if (!comment || comment.deletedAt) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Comment not found",
      }),
    );
  }
  comment.deletedAt = new Date().toISOString();
  comment.body = "This comment was deleted";
  return res.status(204).send();
});

app.get("/api/v1/issues/:issueId/attachments", requireAuth, (req, res) => {
  return res.status(200).json(attachments.filter((attachment) => attachment.issueId === req.params.issueId));
});

app.post("/api/v1/issues/:issueId/attachments", requireAuth, authorize("edit_project"), (req, res, next) => {
  const issue = findIssueById(req.params.issueId);
  if (!issue || issue.deletedAt) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Issue not found",
      }),
    );
  }
  const filename = (req.body && req.body.filename) || "";
  const contentBase64 = (req.body && req.body.contentBase64) || "";
  if (!filename.trim() || !contentBase64.trim()) {
    return next(
      appError({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "filename and contentBase64 are required",
      }),
    );
  }
  const stored = storageService.upload(filename.trim(), contentBase64.trim());
  const attachment = {
    id: `attachment-${attachments.length + 1}`,
    issueId: issue.id,
    uploaderId: req.userId,
    filename: filename.trim(),
    storageKey: stored.key,
    fileUrl: stored.url,
    createdAt: new Date().toISOString(),
  };
  attachments.push(attachment);
  return res.status(201).json(attachment);
});

app.delete("/api/v1/attachments/:attachmentId", requireAuth, authorize("edit_project"), (req, res, next) => {
  const index = attachments.findIndex((attachment) => attachment.id === req.params.attachmentId);
  if (index < 0) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Attachment not found",
      }),
    );
  }
  storageService.delete(attachments[index].storageKey);
  attachments.splice(index, 1);
  return res.status(204).send();
});

app.post("/api/v1/cycles/:cycleId/issues/:issueId", requireAuth, authorizeCycleAction("edit_project"), (req, res, next) => {
  const cycle = req.cycle;
  const issue = findIssueById(req.params.issueId);
  if (!cycle || !issue) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Cycle or issue not found",
      }),
    );
  }
  if (cycle.status !== "active") {
    return next(
      appError({
        type: "https://project-management/errors/conflict",
        title: "Conflict",
        status: 409,
        detail: "Issue assignment requires an active cycle",
      }),
    );
  }
  issue.cycleId = cycle.id;
  issue.updatedAt = new Date().toISOString();
  return res.status(200).json(issue);
});

app.delete("/api/v1/cycles/:cycleId/issues/:issueId", requireAuth, authorizeCycleAction("edit_project"), (req, res, next) => {
  const cycle = req.cycle;
  const issue = findIssueById(req.params.issueId);
  if (!cycle || !issue) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Cycle or issue not found",
      }),
    );
  }
  if (issue.cycleId === cycle.id) {
    issue.cycleId = null;
    issue.updatedAt = new Date().toISOString();
  }
  return res.status(204).send();
});

app.get("/api/v1/cycles/:cycleId/progress", requireAuth, (req, res, next) => {
  const cycle = findCycleById(req.params.cycleId);
  if (!cycle) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Cycle not found",
      }),
    );
  }
  const scopedIssues = issues.filter((issue) => issue.cycleId === cycle.id && !issue.deletedAt);
  const total = scopedIssues.length;
  const completed = scopedIssues.filter((issue) => issue.status === "completed").length;
  return res.status(200).json({
    cycleId: cycle.id,
    totalIssues: total,
    completedIssues: completed,
    completionRate: total === 0 ? 0 : Number((completed / total).toFixed(2)),
    issues: scopedIssues,
  });
});

app.post("/api/v1/projects/:projectId/cycles", requireAuth, authorize("edit_project"), (req, res, next) => {
  const project = findProjectById(req.params.projectId);
  if (!project) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Project not found",
      }),
    );
  }
  const name = (req.body && req.body.name) || "";
  if (!name.trim()) {
    return next(
      appError({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "Cycle name is required",
      }),
    );
  }
  const cycle = {
    id: `cycle-${cycles.length + 1}`,
    projectId: project.id,
    name: name.trim(),
    description: (req.body && req.body.description) || "",
    status: "draft",
    startDate: (req.body && req.body.startDate) || null,
    endDate: (req.body && req.body.endDate) || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    velocitySnapshot: null,
  };
  cycles.push(cycle);
  return res.status(201).json(cycle);
});

app.get("/api/v1/projects/:projectId/cycles", requireAuth, (req, res) => {
  const projectCycles = cycles.filter((cycle) => cycle.projectId === req.params.projectId);
  const page = paginate(projectCycles, req.query.cursor, req.query.limit);
  return res.status(200).json(page);
});

app.get("/api/v1/cycles/:cycleId", requireAuth, (req, res, next) => {
  const cycle = findCycleById(req.params.cycleId);
  if (!cycle) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Cycle not found",
      }),
    );
  }
  return res.status(200).json(cycle);
});

app.patch("/api/v1/cycles/:cycleId", requireAuth, authorizeCycleAction("edit_project"), (req, res, next) => {
  const cycle = req.cycle;
  const fields = ["name", "description", "startDate", "endDate"];
  for (const field of fields) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, field)) {
      cycle[field] = req.body[field];
    }
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "status")) {
    const nextStatus = req.body.status;
    if (!["draft", "active", "completed"].includes(nextStatus)) {
      return next(
        appError({
          type: "https://project-management/errors/validation",
          title: "Validation failed",
          status: 400,
          detail: "Invalid cycle status",
        }),
      );
    }
    if (nextStatus === "active") {
      const activeExists = cycles.some(
        (item) => item.projectId === cycle.projectId && item.status === "active" && item.id !== cycle.id,
      );
      if (activeExists) {
        return next(
          appError({
            type: "https://project-management/errors/conflict",
            title: "Conflict",
            status: 409,
            detail: "Only one active cycle is allowed per project",
          }),
        );
      }
    }
    cycle.status = nextStatus;
  }
  cycle.updatedAt = new Date().toISOString();
  return res.status(200).json(cycle);
});

app.post("/api/v1/cycles/:cycleId/start", requireAuth, authorizeCycleAction("edit_project"), (req, res, next) => {
  const cycle = req.cycle;
  const activeExists = cycles.some(
    (item) => item.projectId === cycle.projectId && item.status === "active" && item.id !== cycle.id,
  );
  if (activeExists) {
    return next(
      appError({
        type: "https://project-management/errors/conflict",
        title: "Conflict",
        status: 409,
        detail: "Only one active cycle is allowed per project",
      }),
    );
  }
  cycle.status = "active";
  cycle.updatedAt = new Date().toISOString();
  return res.status(200).json(cycle);
});

app.post("/api/v1/cycles/:cycleId/complete", requireAuth, authorizeCycleAction("edit_project"), (req, res, next) => {
  const cycle = req.cycle;
  const scopedIssues = issues.filter((issue) => issue.cycleId === cycle.id && !issue.deletedAt);
  const completed = scopedIssues.filter((issue) => issue.status === "completed").length;
  cycle.velocitySnapshot = {
    totalIssues: scopedIssues.length,
    completedIssues: completed,
    completionRate: scopedIssues.length === 0 ? 0 : Number((completed / scopedIssues.length).toFixed(2)),
    capturedAt: new Date().toISOString(),
  };
  cycle.status = "completed";
  cycle.updatedAt = new Date().toISOString();
  return res.status(200).json(cycle);
});

app.delete("/api/v1/issues/:issueId", requireAuth, authorizeIssueAction("delete_project"), (req, res, next) => {
  const issue = req.issue;
  issue.deletedAt = new Date().toISOString();
  issue.updatedAt = new Date().toISOString();
  return res.status(204).send();
});

app.post("/api/v1/issues/:issueId/restore", requireAuth, authorizeIssueAction("delete_project"), (req, res, next) => {
  const issue = req.issue;
  issue.deletedAt = null;
  issue.updatedAt = new Date().toISOString();
  return res.status(200).json(issue);
});

app.patch("/api/v1/projects/:projectId", requireAuth, (req, res) => {
  const blocked = authorizeProject("edit_project")(req, res);
  if (blocked) {
    return blocked;
  }
  const allowedFields = ["name", "status", "leadId", "startDate", "targetDate", "icon", "color", "externalLinks"];
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      req.project[field] = req.body[field];
    }
  }
  return res.status(200).json(req.project);
});

app.post("/api/v1/projects/:projectId/archive", requireAuth, (req, res) => {
  const blocked = authorizeProject("delete_project")(req, res);
  if (blocked) {
    return blocked;
  }
  req.project.archivedAt = new Date().toISOString();
  req.project.status = "completed";
  return res.status(200).json(req.project);
});

app.delete("/api/v1/teams/:teamId/projects/:projectId", requireAuth, authorize("delete_project"), (req, res) => {
  const index = projects.findIndex((p) => p.id === req.params.projectId && p.teamId === req.params.teamId);
  if (index >= 0) {
    projects.splice(index, 1);
  }
  return res.status(204).send();
});

app.get("/api/v1/projects/:projectId", requireAuth, (req, res) => {
  const project = findProjectById(req.params.projectId);
  if (!project) {
    return res.status(404).json(
      createProblem({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Project not found",
        instance: req.path,
      }),
    );
  }
  if (req.query.teamId && project.teamId !== req.query.teamId) {
    return res.status(404).json(
      createProblem({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Project not found in this team context",
        instance: req.path,
      }),
    );
  }
  return res.status(200).json(project);
});

app.get("/api/v1/teams/:teamId/projects", requireAuth, (req, res) => {
  let teamProjects = projects.filter((p) => p.teamId === req.params.teamId);
  const query = String(req.query.q || "").trim().toLowerCase();
  const status = String(req.query.status || "").trim().toLowerCase();
  if (query) {
    teamProjects = teamProjects.filter((project) => project.name.toLowerCase().includes(query));
  }
  if (status) {
    teamProjects = teamProjects.filter((project) => String(project.status || "").toLowerCase() === status);
  }
  const page = paginate(teamProjects, req.query.cursor, req.query.limit);
  return res.status(200).json(page);
});

app.get("/api/v1/error-sample", (req, res, next) => {
  next(
    appError({
      type: "https://project-management/errors/not-found",
      title: "Resource not found",
      status: 404,
      detail: "Requested sample resource was not found",
    }),
  );
});

app.post("/api/v1/organisations", requireAuth, (req, res, next) => {
  const name = (req.body && req.body.name) || "";
  if (!name.trim()) {
    return next(
      appError({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "Organisation name is required",
      }),
    );
  }

  const org = {
    id: `org-${organisations.length + 1}`,
    name: name.trim(),
    slug: slugify(name) || `org-${organisations.length + 1}`,
    createdBy: req.userId,
  };
  organisations.push(org);
  orgMemberships.set(req.userId, { orgRole: "admin", organisationId: org.id });
  return res.status(201).json(org);
});

app.post("/api/v1/organisations/:orgId/teams", requireAuth, (req, res) => {
  const org = orgMemberships.get(req.userId) || { orgRole: "member" };
  const authz = assertAllowed("create_team", org.orgRole, null);
  if (!authz.allowed) {
    return res.status(403).json(
      createProblem({
        type: "https://project-management/errors/forbidden",
        title: "Forbidden",
        status: 403,
        detail: "Only org admins can create teams",
        instance: req.path,
      }),
    );
  }

  const name = (req.body && req.body.name) || "New Team";
  const identifier = ((req.body && req.body.identifier) || `TEAM${teams.length + 1}`).toUpperCase();
  const identifierValid = /^[A-Z][A-Z0-9_-]{1,9}$/.test(identifier);
  const identifierInUse = teams.some((team) => team.identifier === identifier);
  if (!identifierValid || identifierInUse) {
    return res.status(400).json(
      createProblem({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "Identifier must be unique and match ^[A-Z][A-Z0-9_-]{1,9}$",
        instance: req.path,
      }),
    );
  }
  const team = {
    id: `team-${teams.length + 1}`,
    orgId: req.params.orgId,
    name,
    identifier,
  };
  teams.push(team);
  teamMemberships.set(`${team.id}:${req.userId}`, { teamRole: "owner" });
  const defaults = [
    { name: "Backlog", type: "backlog", color: "#6b7280" },
    { name: "Todo", type: "unstarted", color: "#0284c7" },
    { name: "In Progress", type: "started", color: "#2563eb" },
    { name: "Done", type: "completed", color: "#16a34a" },
  ];
  defaults.forEach((item, index) => {
    workflowStates.push({
      id: `state-${workflowStates.length + 1}`,
      teamId: team.id,
      name: item.name,
      type: item.type,
      color: item.color,
      position: index + 1,
    });
  });
  return res.status(201).json(team);
});

app.patch("/api/v1/teams/:teamId/settings", requireAuth, authorize("manage_team_members"), (req, res, next) => {
  const team = teams.find((item) => item.id === req.params.teamId);
  if (!team) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Team not found",
      }),
    );
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "identifier")) {
    const candidate = String(req.body.identifier || "").toUpperCase();
    const identifierValid = /^[A-Z][A-Z0-9_-]{1,9}$/.test(candidate);
    const identifierInUse = teams.some((item) => item.id !== team.id && item.identifier === candidate);
    if (!identifierValid || identifierInUse) {
      return next(
        appError({
          type: "https://project-management/errors/validation",
          title: "Validation failed",
          status: 400,
          detail: "Identifier must be unique and match ^[A-Z][A-Z0-9_-]{1,9}$",
        }),
      );
    }
    team.identifier = candidate;
  }
  return res.status(200).json(team);
});

app.post("/api/v1/teams/:teamId/members", requireAuth, authorize("manage_team_members"), (req, res, next) => {
  const userId = req.body && req.body.userId;
  const role = req.body && req.body.role;
  if (!userId || !["owner", "member", "guest"].includes(role)) {
    return next(
      appError({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "userId and valid role are required",
      }),
    );
  }
  teamMemberships.set(`${req.params.teamId}:${userId}`, { teamRole: role });
  return res.status(200).json({ teamId: req.params.teamId, userId, role });
});

app.delete("/api/v1/teams/:teamId/members/:userId", requireAuth, authorize("manage_team_members"), (req, res) => {
  teamMemberships.delete(`${req.params.teamId}:${req.params.userId}`);
  return res.status(204).send();
});

app.get("/api/v1/teams/:teamId/labels", requireAuth, (req, res) => {
  return res.status(200).json(labels.filter((l) => l.teamId === req.params.teamId));
});

app.post("/api/v1/teams/:teamId/labels", requireAuth, authorize("edit_project"), (req, res, next) => {
  const name = (req.body && req.body.name) || "";
  if (!name.trim()) {
    return next(
      appError({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "Label name is required",
      }),
    );
  }
  const label = {
    id: `label-${labels.length + 1}`,
    teamId: req.params.teamId,
    name: name.trim(),
    color: (req.body && req.body.color) || "#6b7280",
  };
  labels.push(label);
  return res.status(201).json(label);
});

app.patch("/api/v1/labels/:labelId", requireAuth, authorize("edit_project"), (req, res, next) => {
  const label = labels.find((item) => item.id === req.params.labelId);
  if (!label) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Label not found",
      }),
    );
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "name")) {
    label.name = req.body.name;
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "color")) {
    label.color = req.body.color;
  }
  return res.status(200).json(label);
});

app.get("/api/v1/teams/:teamId/workflow-states", requireAuth, (req, res) => {
  const states = workflowStates
    .filter((state) => state.teamId === req.params.teamId)
    .sort((a, b) => a.position - b.position);
  return res.status(200).json(states);
});

app.post("/api/v1/teams/:teamId/workflow-states", requireAuth, authorize("edit_project"), (req, res, next) => {
  const name = (req.body && req.body.name) || "";
  const type = (req.body && req.body.type) || "";
  if (!name.trim() || !workflowSemanticTypes.has(type)) {
    return next(
      appError({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "Workflow state requires valid name and semantic type",
      }),
    );
  }
  const sameTeamStates = workflowStates.filter((state) => state.teamId === req.params.teamId);
  const state = {
    id: `state-${workflowStates.length + 1}`,
    teamId: req.params.teamId,
    name: name.trim(),
    type,
    color: (req.body && req.body.color) || "#6b7280",
    position: sameTeamStates.length + 1,
  };
  workflowStates.push(state);
  return res.status(201).json(state);
});

app.patch("/api/v1/workflow-states/:stateId", requireAuth, authorize("edit_project"), (req, res, next) => {
  const state = workflowStates.find((item) => item.id === req.params.stateId);
  if (!state) {
    return next(
      appError({
        type: "https://project-management/errors/not-found",
        title: "Resource not found",
        status: 404,
        detail: "Workflow state not found",
      }),
    );
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "name")) {
    state.name = req.body.name;
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "color")) {
    state.color = req.body.color;
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, "type")) {
    if (!workflowSemanticTypes.has(req.body.type)) {
      return next(
        appError({
          type: "https://project-management/errors/validation",
          title: "Validation failed",
          status: 400,
          detail: "Invalid workflow semantic type",
        }),
      );
    }
    state.type = req.body.type;
  }
  return res.status(200).json(state);
});

app.post("/api/v1/teams/:teamId/workflow-states/reorder", requireAuth, authorize("edit_project"), (req, res, next) => {
  const orderedIds = (req.body && req.body.orderedIds) || [];
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return next(
      appError({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "orderedIds must be a non-empty array",
      }),
    );
  }
  const teamStates = workflowStates.filter((state) => state.teamId === req.params.teamId);
  if (orderedIds.length !== teamStates.length) {
    return next(
      appError({
        type: "https://project-management/errors/validation",
        title: "Validation failed",
        status: 400,
        detail: "orderedIds must include all team state IDs",
      }),
    );
  }
  orderedIds.forEach((id, index) => {
    const state = workflowStates.find((item) => item.id === id && item.teamId === req.params.teamId);
    if (state) {
      state.position = index + 1;
    }
  });
  return res.status(200).json(
    workflowStates
      .filter((state) => state.teamId === req.params.teamId)
      .sort((a, b) => a.position - b.position),
  );
});

app.use((err, req, res, next) => {
  metrics.errorsTotal += 1;
  return next(err);
});
app.use(problemDetailsMiddleware);

module.exports = { app };
