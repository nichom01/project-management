const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("planning fields are editable and tracked in activity", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Planning Fields Host" });
  const issue = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "Plan me" });

  const updated = await agent.patch(`/api/v1/issues/${issue.body.id}`).send({
    priority: "high",
    estimate: 8,
    dueDate: "2026-06-01",
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.estimate, 8);
  assert.equal(updated.body.dueDate, "2026-06-01");

  const activity = await agent.get(`/api/v1/issues/${issue.body.id}/activity`);
  const types = activity.body.map((item) => item.type);
  assert.equal(types.includes("priority_changed"), true);
  assert.equal(types.includes("estimate_changed"), true);
  assert.equal(types.includes("dueDate_changed"), true);
});

test("planning field validation rejects invalid values", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Planning Validation Host" });
  const issue = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "Validate me" });

  const badEstimate = await agent.patch(`/api/v1/issues/${issue.body.id}`).send({ estimate: -1 });
  assert.equal(badEstimate.status, 400);

  const badDueDate = await agent.patch(`/api/v1/issues/${issue.body.id}`).send({ dueDate: "06/01/2026" });
  assert.equal(badDueDate.status, 400);
});
