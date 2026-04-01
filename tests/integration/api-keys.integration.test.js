const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("api key lifecycle and bearer authentication works", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email: "admin@example.com", password: "password123" });

  const created = await agent.post("/api/v1/users/me/api-keys").send({ label: "automation" });
  assert.equal(created.status, 201);
  assert.ok(created.body.key.startsWith("pmk_"));

  const listed = await agent.get("/api/v1/users/me/api-keys");
  assert.equal(listed.status, 200);
  assert.equal(listed.body[0].label, "automation");
  assert.equal(Object.prototype.hasOwnProperty.call(listed.body[0], "key"), false);

  const whoami = await request(app)
    .get("/api/v1/auth/whoami")
    .set("Authorization", `Bearer ${created.body.key}`);
  assert.equal(whoami.status, 200);
  assert.equal(whoami.body.authType, "api_key");

  const revoked = await agent.delete(`/api/v1/users/me/api-keys/${created.body.id}`);
  assert.equal(revoked.status, 204);

  const postRevoke = await request(app)
    .get("/api/v1/auth/whoami")
    .set("Authorization", `Bearer ${created.body.key}`);
  assert.equal(postRevoke.status, 401);
});
