const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("project create, edit, and archive lifecycle works for authorized user", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });

  const created = await agent.post("/api/v1/teams/team-1/projects").send({
    name: "Delivery Project",
    status: "planning",
    leadId: "u-2",
    startDate: "2026-04-01",
    targetDate: "2026-05-01",
    color: "#2563eb",
  });
  assert.equal(created.status, 201);

  const updated = await agent.patch(`/api/v1/projects/${created.body.id}`).send({
    status: "active",
    externalLinks: [{ label: "Roadmap", url: "https://example.com/roadmap" }],
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.status, "active");
  assert.equal(updated.body.externalLinks.length, 1);

  const archived = await agent.post(`/api/v1/projects/${created.body.id}/archive`).send({});
  assert.equal(archived.status, 200);
  assert.ok(Boolean(archived.body.archivedAt));
});

test("guest cannot mutate project", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "guest@example.com",
    password: "password123",
  });

  const created = await agent.post("/api/v1/teams/team-1/projects").send({ name: "No Access" });
  assert.equal(created.status, 403);
});
