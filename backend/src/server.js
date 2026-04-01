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
}));
const organisations = [];
const teams = [{ id: "team-1", orgId: "org-0", name: "Default Team", identifier: "ENG" }];

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
  return res.status(201).json({
    id: "project-1",
    teamId: req.params.teamId,
    name: (req.body && req.body.name) || "Untitled",
    createdBy: req.userId,
    roleUsed: req.effectiveRole,
  });
});

app.delete("/api/v1/teams/:teamId/projects/:projectId", requireAuth, authorize("delete_project"), (req, res) => {
  return res.status(204).send();
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
  const identifier = (req.body && req.body.identifier) || `TEAM${teams.length + 1}`;
  const team = {
    id: `team-${teams.length + 1}`,
    orgId: req.params.orgId,
    name,
    identifier,
  };
  teams.push(team);
  teamMemberships.set(`${team.id}:${req.userId}`, { teamRole: "owner" });
  return res.status(201).json(team);
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

app.use(problemDetailsMiddleware);

module.exports = { app };
