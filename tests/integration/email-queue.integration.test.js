const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("email notifications are queued asynchronously and retry before sent", async () => {
  const admin = request.agent(app);
  await admin.post("/api/v1/auth/login").send({ email: "admin@example.com", password: "password123" });
  const project = await admin.post("/api/v1/teams/team-1/projects").send({ name: "Email Queue Host" });

  await admin.post(`/api/v1/projects/${project.body.id}/issues`).send({
    title: "Trigger email notification",
    assigneeId: "u-2",
  });

  const firstProcess = await admin.post("/api/v1/dev/email-queue/process").send({});
  assert.equal(firstProcess.status, 200);
  assert.equal(firstProcess.body.retrying >= 1, true);

  const secondProcess = await admin.post("/api/v1/dev/email-queue/process").send({});
  assert.equal(secondProcess.status, 200);
  assert.equal(secondProcess.body.sent >= 1, true);

  const outbox = await admin.get("/api/v1/dev/email-outbox");
  assert.equal(outbox.status, 200);
  assert.equal(outbox.body.length >= 1, true);
});
