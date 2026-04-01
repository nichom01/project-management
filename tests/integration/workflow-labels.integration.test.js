const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("team can create and update labels", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });

  const label = await agent.post("/api/v1/teams/team-1/labels").send({ name: "api", color: "#000000" });
  assert.equal(label.status, 201);

  const updated = await agent.patch(`/api/v1/labels/${label.body.id}`).send({ name: "api-v2" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, "api-v2");
});

test("workflow states enforce semantic type and allow reordering", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });

  const invalid = await agent.post("/api/v1/teams/team-1/workflow-states").send({ name: "Blocked", type: "invalid" });
  assert.equal(invalid.status, 400);

  const created = await agent.post("/api/v1/teams/team-1/workflow-states").send({ name: "Review", type: "started" });
  assert.equal(created.status, 201);

  const listed = await agent.get("/api/v1/teams/team-1/workflow-states");
  const reversed = listed.body.map((state) => state.id).reverse();
  const reordered = await agent
    .post("/api/v1/teams/team-1/workflow-states/reorder")
    .send({ orderedIds: reversed });

  assert.equal(reordered.status, 200);
  assert.equal(reordered.body[0].id, reversed[0]);
});
