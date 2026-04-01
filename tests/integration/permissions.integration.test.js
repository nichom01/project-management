const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

async function loginAs(agent, email) {
  return agent.post("/api/v1/auth/login").send({
    email,
    password: "password123",
  });
}

test("member can create project through centralized permission check", async () => {
  const agent = request.agent(app);
  await loginAs(agent, "member@example.com");

  const res = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Alpha" });
  assert.equal(res.status, 201);
  assert.equal(res.body.roleUsed, "member");
});

test("guest is forbidden from create project", async () => {
  const agent = request.agent(app);
  await loginAs(agent, "guest@example.com");

  const res = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Alpha" });
  assert.equal(res.status, 403);
});

test("org admin can delete project due to override", async () => {
  const agent = request.agent(app);
  await loginAs(agent, "admin@example.com");

  const res = await agent.delete("/api/v1/teams/team-1/projects/project-1").send({});
  assert.equal(res.status, 204);
});
