const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("comment create/edit/delete lifecycle with soft-delete rendering", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Comment Host" });
  const issue = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "Need discussion" });

  const created = await agent.post(`/api/v1/issues/${issue.body.id}/comments`).send({ body: "First note" });
  assert.equal(created.status, 201);

  const edited = await agent.patch(`/api/v1/comments/${created.body.id}`).send({ body: "Edited note" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.body, "Edited note");

  const deleted = await agent.delete(`/api/v1/comments/${created.body.id}`);
  assert.equal(deleted.status, 204);

  const list = await agent.get(`/api/v1/issues/${issue.body.id}/comments`);
  assert.equal(list.status, 200);
  assert.equal(list.body[0].body, "This comment was deleted");
});
