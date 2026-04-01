const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("notifications list/read/read-all transitions persist", async () => {
  const admin = request.agent(app);
  const member = request.agent(app);
  await admin.post("/api/v1/auth/login").send({ email: "admin@example.com", password: "password123" });
  await member.post("/api/v1/auth/login").send({ email: "member@example.com", password: "password123" });

  const project = await admin.post("/api/v1/teams/team-1/projects").send({ name: "Notification Host" });
  await admin.post(`/api/v1/projects/${project.body.id}/issues`).send({ title: "Assign me", assigneeId: "u-2" });

  const inbox = await member.get("/api/v1/notifications");
  assert.equal(inbox.status, 200);
  assert.equal(inbox.body.unreadCount >= 1, true);

  const firstId = inbox.body.data[0].id;
  const readOne = await member.post(`/api/v1/notifications/${firstId}/read`).send({});
  assert.equal(readOne.status, 200);
  assert.equal(Boolean(readOne.body.readAt), true);

  const readAll = await member.post("/api/v1/notifications/read-all").send({});
  assert.equal(readAll.status, 200);
});
