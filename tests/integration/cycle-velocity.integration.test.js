const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("velocity snapshot is captured on cycle completion and visible in cycle detail", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Velocity Host" });
  const cycle = await agent.post(`/api/v1/projects/${project.body.id}/cycles`).send({ name: "Sprint Velocity" });
  await agent.post(`/api/v1/cycles/${cycle.body.id}/start`).send({});

  const issueA = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "A" });
  const issueB = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "B" });
  await agent.post(`/api/v1/cycles/${cycle.body.id}/issues/${issueA.body.id}`).send({});
  await agent.post(`/api/v1/cycles/${cycle.body.id}/issues/${issueB.body.id}`).send({});
  await agent.post(`/api/v1/issues/${issueA.body.id}/transition`).send({ toStatus: "completed" });

  const completed = await agent.post(`/api/v1/cycles/${cycle.body.id}/complete`).send({});
  assert.equal(completed.status, 200);
  assert.equal(completed.body.velocitySnapshot.totalIssues, 2);
  assert.equal(completed.body.velocitySnapshot.completedIssues, 1);

  const detail = await agent.get(`/api/v1/cycles/${cycle.body.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.velocitySnapshot.completionRate, 0.5);
});
