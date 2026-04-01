const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static("frontend"));

const accessCookieName = "pm_access";
const refreshCookieName = "pm_refresh";
const refreshSessions = new Map();

const users = [
  {
    id: "u-1",
    email: "admin@example.com",
    password: "password123",
    name: "Admin User",
  },
];

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

app.post("/api/v1/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = users.find((u) => u.email === email && u.password === password);

  if (!user) {
    return res.status(401).json({
      type: "https://project-management/errors/auth-invalid",
      title: "Invalid credentials",
      status: 401,
      detail: "Email or password is incorrect",
      instance: "/api/v1/auth/login",
    });
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
    return res.status(401).json({
      type: "https://project-management/errors/auth-refresh-invalid",
      title: "Refresh token invalid",
      status: 401,
      detail: "Session is expired or invalid. Login again.",
      instance: "/api/v1/auth/refresh",
    });
  }

  refreshSessions.delete(refreshToken);
  setSessionCookies(res, existing.userId);
  return res.status(200).json({ ok: true });
});

app.post("/api/v1/auth/logout", (req, res) => {
  const refreshToken = req.cookies[refreshCookieName];
  if (refreshToken) {
    refreshSessions.delete(refreshToken);
  }
  clearSessionCookies(res);
  return res.status(200).json({ ok: true });
});

module.exports = { app };
