const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("soft-deleted issues are hidden by default and can be restored", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Soft Delete Host" });
  const issue = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "Soft delete me" });

  const deleted = await agent.delete(`/api/v1/issues/${issue.body.id}`);
  assert.equal(deleted.status, 204);

  const hidden = await agent.get(`/api/v1/issues/${issue.body.id}`);
  assert.equal(hidden.status, 404);

  const listed = await agent.get(`/api/v1/projects/${project.body.id}/issues`);
  assert.equal(listed.body.data.some((item) => item.id === issue.body.id), false);

  const restored = await agent.post(`/api/v1/issues/${issue.body.id}/restore`).send({});
  assert.equal(restored.status, 200);
  assert.equal(restored.body.deletedAt, null);
});
