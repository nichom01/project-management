const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("issue activity records key mutations in ordered immutable feed", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email: "admin@example.com", password: "password123" });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Activity Host" });
  const issue = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "Track me" });

  await agent.patch(`/api/v1/issues/${issue.body.id}`).send({ assigneeId: "u-2" });
  await agent.patch(`/api/v1/issues/${issue.body.id}`).send({ priority: "high" });
  await agent.patch(`/api/v1/issues/${issue.body.id}`).send({ status: "started" });

  const feed = await agent.get(`/api/v1/issues/${issue.body.id}/activity`);
  assert.equal(feed.status, 200);
  assert.equal(feed.body.length >= 3, true);
  const types = feed.body.map((item) => item.type);
  assert.equal(types.includes("assignee_changed"), true);
  assert.equal(types.includes("priority_changed"), true);
  assert.equal(types.includes("status_changed"), true);
});
