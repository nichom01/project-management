const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

async function login(agent) {
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
}

test("project list supports cursor pagination defaults and max", async () => {
  const agent = request.agent(app);
  await login(agent);

  const first = await agent.get("/api/v1/teams/team-1/projects");
  assert.equal(first.status, 200);
  assert.equal(first.body.data.length, 25);
  assert.equal(first.body.hasMore, true);
  assert.ok(typeof first.body.nextCursor === "string");

  const maxed = await agent.get("/api/v1/teams/team-1/projects?limit=999");
  assert.equal(maxed.status, 200);
  assert.equal(maxed.body.data.length, 100);
});

test("problem details contract is returned by error middleware", async () => {
  const res = await request(app).get("/api/v1/error-sample");
  assert.equal(res.status, 404);
  assert.deepEqual(Object.keys(res.body), ["type", "title", "status", "detail", "instance"]);
  assert.equal(res.body.type, "https://project-management/errors/not-found");
  assert.equal(res.body.instance, "/api/v1/error-sample");
});
