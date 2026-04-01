const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("attachment upload/list/delete works through storage abstraction", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email: "admin@example.com", password: "password123" });
  const project = await agent.post("/api/v1/teams/team-1/projects").send({ name: "Attachment Host" });
  const issue = await agent.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "Attachment target" });

  const uploaded = await agent.post(`/api/v1/issues/${issue.body.id}/attachments`).send({
    filename: "note.txt",
    contentBase64: "aGVsbG8=",
  });
  assert.equal(uploaded.status, 201);

  const listed = await agent.get(`/api/v1/issues/${issue.body.id}/attachments`);
  assert.equal(listed.status, 200);
  assert.equal(listed.body.length, 1);

  const removed = await agent.delete(`/api/v1/attachments/${uploaded.body.id}`);
  assert.equal(removed.status, 204);
});
