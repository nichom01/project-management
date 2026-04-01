const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("issue list supports table and board views", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Issue Views Host" });

  await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "A", status: "backlog" });
  await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "B", status: "started" });

  const table = await agent.get(`/api/v1/projects/${project.body.id}/issues?view=table&limit=10`);
  assert.equal(table.status, 200);
  assert.equal(table.body.view, "table");
  assert.equal(Array.isArray(table.body.data), true);

  const board = await agent.get(`/api/v1/projects/${project.body.id}/issues?view=board&limit=10`);
  assert.equal(board.status, 200);
  assert.equal(board.body.view, "board");
  assert.equal(typeof board.body.lanes, "object");
});

test("issue transition updates activity stream", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Issue Transition Host" });
  const issue = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "Transition me" });

  const moved = await agent.post(`/api/v1/issues/${issue.body.id}/transition`).send({ toStatus: "completed" });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.status, "completed");

  const activity = await agent.get(`/api/v1/issues/${issue.body.id}/activity`);
  assert.equal(activity.status, 200);
  assert.equal(activity.body.length >= 1, true);
  assert.equal(activity.body[activity.body.length - 1].type, "status_changed");
});
