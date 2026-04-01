const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("org admin can create team and manage members", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const org = await agent.post("/api/v1/organisations").send({ name: "Admin Org" });

  const team = await agent
    .post(`/api/v1/organisations/${org.body.id}/teams`)
    .send({ name: "Platform", identifier: "PLT" });
  assert.equal(team.status, 201);

  const add = await agent.post(`/api/v1/teams/${team.body.id}/members`).send({ userId: "u-3", role: "member" });
  assert.equal(add.status, 200);

  const remove = await agent.delete(`/api/v1/teams/${team.body.id}/members/u-3`);
  assert.equal(remove.status, 204);
});

test("member cannot create team", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "member@example.com",
    password: "password123",
  });
  const res = await agent.post("/api/v1/organisations/org-1/teams").send({ name: "Nope", identifier: "NO" });
  assert.equal(res.status, 403);
});
