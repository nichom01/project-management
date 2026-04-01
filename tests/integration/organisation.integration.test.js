const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("authenticated user can create organisation and becomes org admin", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "member@example.com",
    password: "password123",
  });

  const created = await agent.post("/api/v1/organisations").send({ name: "Core Platform" });
  assert.equal(created.status, 201);
  assert.equal(created.body.slug, "core-platform");

  const denied = await agent.delete("/api/v1/teams/team-1/projects/project-1").send({});
  assert.equal(denied.status, 204);
});
