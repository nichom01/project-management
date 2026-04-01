const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("one-level sub-issues are supported and visible in parent detail", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Sub-issue Host" });
  const parent = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "Parent task" });
  const child = await agent
    .post(`/api/v1/projects/${project.body.id}/issues`)
    .send({ title: "Child task", parentId: parent.body.id });

  assert.equal(child.status, 201);
  assert.equal(child.body.parentId, parent.body.id);

  const detail = await agent.get(`/api/v1/issues/${parent.body.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.subIssues.length, 1);
});

test("nested sub-issues are rejected", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Sub-issue Host 2" });
  const parent = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "Parent task 2" });
  const child = await agent
    .post(`/api/v1/projects/${project.body.id}/issues`)
    .send({ title: "Child task 2", parentId: parent.body.id });

  const nested = await agent
    .post(`/api/v1/projects/${project.body.id}/issues`)
    .send({ title: "Nested child", parentId: child.body.id });
  assert.equal(nested.status, 400);
});
