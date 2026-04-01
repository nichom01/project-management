const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("outsider cannot mutate issues or cycles in team they do not belong to", async () => {
  const admin = request.agent(app);
  const outsider = request.agent(app);
  await admin.post("/api/v1/auth/login").send({ email: "admin@example.com", password: "password123" });
  await outsider.post("/api/v1/auth/login").send({ email: "outsider@example.com", password: "password123" });

  const project = await admin.post("/api/v1/teams/team-1/projects").send({ name: "Security Host" });
  const issue = await admin.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "Protected issue" });
  const cycle = await admin.post(`/api/v1/projects/${project.body.id}/cycles`).send({ name: "Protected cycle" });

  const patchIssue = await outsider.patch(`/api/v1/issues/${issue.body.id}`).send({ title: "Hacked" });
  assert.equal(patchIssue.status, 403);

  const startCycle = await outsider.post(`/api/v1/cycles/${cycle.body.id}/start`).send({});
  assert.equal(startCycle.status, 403);
});
