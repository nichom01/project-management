const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("login sets access and refresh cookies", async () => {
  const res = await request(app).post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });

  assert.equal(res.status, 200);
  assert.ok(res.headers["set-cookie"].some((c) => c.startsWith("pm_access=")));
  assert.ok(res.headers["set-cookie"].some((c) => c.startsWith("pm_refresh=")));
});

test("refresh rotates refresh cookie", async () => {
  const agent = request.agent(app);
  const login = await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const before = login.headers["set-cookie"].find((c) => c.startsWith("pm_refresh="));

  const refresh = await agent.post("/api/v1/auth/refresh").send({});
  const after = refresh.headers["set-cookie"].find((c) => c.startsWith("pm_refresh="));

  assert.equal(refresh.status, 200);
  assert.notEqual(before, after);
});

test("logout clears session cookies", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });

  const logout = await agent.post("/api/v1/auth/logout").send({});
  assert.equal(logout.status, 200);
  assert.ok(logout.headers["set-cookie"].some((c) => c.includes("pm_access=;")));
  assert.ok(logout.headers["set-cookie"].some((c) => c.includes("pm_refresh=;")));
});
