const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("project list supports team scoped search and status filtering", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });

  await agent.post("/api/v1/teams/team-1/projects").send({ name: "Alpha Engine", status: "active" });
  await agent.post("/api/v1/teams/team-1/projects").send({ name: "Beta Docs", status: "planning" });

  const filtered = await agent.get("/api/v1/teams/team-1/projects?q=alpha&status=active&limit=10");
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.data.length >= 1, true);
  assert.equal(filtered.body.data.some((project) => project.name === "Alpha Engine"), true);
});

test("project detail respects team context", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const created = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Scoped Project" });

  const ok = await agent.get(`/api/v1/projects/${created.body.id}?teamId=team-1`);
  assert.equal(ok.status, 200);

  const wrongTeam = await agent.get(`/api/v1/projects/${created.body.id}?teamId=team-999`);
  assert.equal(wrongTeam.status, 404);
});
