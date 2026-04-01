const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const { assertAllowed } = require("./permission-service");
const { paginate } = require("./pagination");
const { createProblem, appError, problemDetailsMiddleware } = require("./problem-details");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static("frontend"));

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
];

const orgMemberships = new Map([
  ["u-1", { orgRole: "admin" }],
  ["u-2", { orgRole: "member" }],
  ["u-3", { orgRole: "member" }],
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

function findProjectById(projectId) {
  return projects.find((project) => project.id === projectId);
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
  return res.status(200).json(project);
});

app.get("/api/v1/teams/:teamId/projects", requireAuth, (req, res) => {
  const teamProjects = projects.filter((p) => p.teamId === req.params.teamId);
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

app.use(problemDetailsMiddleware);

module.exports = { app };
