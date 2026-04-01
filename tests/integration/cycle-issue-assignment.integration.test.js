const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("issues can be assigned/unassigned to an active cycle and progress is reported", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Planning Host" });
  const cycle = await agent.post(`/api/v1/projects/${project.body.id}/cycles`).send({ name: "Sprint Plan" });
  await agent.post(`/api/v1/cycles/${cycle.body.id}/start`).send({});

  const issue = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "Plan me" });

  const assigned = await agent.post(`/api/v1/cycles/${cycle.body.id}/issues/${issue.body.id}`).send({});
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.cycleId, cycle.body.id);

  await agent.post(`/api/v1/issues/${issue.body.id}/transition`).send({ toStatus: "completed" });
  const progress = await agent.get(`/api/v1/cycles/${cycle.body.id}/progress`);
  assert.equal(progress.status, 200);
  assert.equal(progress.body.totalIssues, 1);
  assert.equal(progress.body.completedIssues, 1);

  const unassigned = await agent.delete(`/api/v1/cycles/${cycle.body.id}/issues/${issue.body.id}`);
  assert.equal(unassigned.status, 204);
});

test("assignment to draft cycle is rejected", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Planning Host 2" });
  const cycle = await agent.post(`/api/v1/projects/${project.body.id}/cycles`).send({ name: "Draft Sprint" });
  const issue = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "Cannot assign yet" });

  const assigned = await agent.post(`/api/v1/cycles/${cycle.body.id}/issues/${issue.body.id}`).send({});
  assert.equal(assigned.status, 409);
});
