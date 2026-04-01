const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("issue create/edit/detail/delete lifecycle works", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });

  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Issue Host" });
  const created = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({
    title: "Cannot save profile",
    description: "Save button fails",
    assigneeId: "u-2",
    priority: "high",
  });
  assert.equal(created.status, 201);

  const updated = await agent.patch(`/api/v1/issues/${created.body.id}`).send({
    status: "started",
    priority: "urgent",
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.priority, "urgent");

  const detail = await agent.get(`/api/v1/issues/${created.body.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.assigneeId, "u-2");

  const removed = await agent.delete(`/api/v1/issues/${created.body.id}`);
  assert.equal(removed.status, 204);
});
