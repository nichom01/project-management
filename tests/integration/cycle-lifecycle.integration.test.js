const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("cycle create/start/complete lifecycle works", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Cycle Host A" });

  const created = await agent.post(`/api/v1/projects/${project.body.id}/cycles`).send({ name: "Sprint A1" });
  assert.equal(created.status, 201);

  const started = await agent.post(`/api/v1/cycles/${created.body.id}/start`).send({});
  assert.equal(started.status, 200);
  assert.equal(started.body.status, "active");

  const completed = await agent.post(`/api/v1/cycles/${created.body.id}/complete`).send({});
  assert.equal(completed.status, 200);
  assert.equal(completed.body.status, "completed");
});

test("only one active cycle is allowed per project", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Cycle Host B" });

  const first = await agent.post(`/api/v1/projects/${project.body.id}/cycles`).send({ name: "Sprint B1" });
  const second = await agent.post(`/api/v1/projects/${project.body.id}/cycles`).send({ name: "Sprint B2" });

  const startFirst = await agent.post(`/api/v1/cycles/${first.body.id}/start`).send({});
  assert.equal(startFirst.status, 200);

  const startSecond = await agent.post(`/api/v1/cycles/${second.body.id}/start`).send({});
  assert.equal(startSecond.status, 409);
});
