const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("health endpoint and metrics counters are observable", async () => {
  const admin = request.agent(app);
  await admin.post("/api/v1/auth/login").send({ email: "admin@example.com", password: "password123" });

  const health = await request(app).get("/api/v1/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.status, "ok");

  await admin.get("/api/v1/error-sample");
  const metrics = await admin.get("/api/v1/metrics");
  assert.equal(metrics.status, 200);
  assert.equal(metrics.body.requestsTotal >= 1, true);
  assert.equal(metrics.body.errorsTotal >= 1, true);
});
