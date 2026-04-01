const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

test("notification preferences persist and in-app delivery respects toggles", async () => {
  const admin = request.agent(app);
  const member = request.agent(app);
  await admin.post("/api/v1/auth/login").send({ email: "admin@example.com", password: "password123" });
  await member.post("/api/v1/auth/login").send({ email: "member@example.com", password: "password123" });

  const setPref = await member.patch("/api/v1/users/me/notification-preferences").send({
    preferences: [{ eventType: "issue_assigned", channel: "in_app", enabled: false }],
  });
  assert.equal(setPref.status, 200);

  const project = await admin.post("/api/v1/teams/team-1/projects").send({ name: "Preference Host" });
  await admin.post(`/api/v1/projects/${project.body.id}/issues`).send({
    title: "Assignment respects pref",
    assigneeId: "u-2",
  });

  const inbox = await member.get("/api/v1/notifications");
  assert.equal(inbox.status, 200);
  const hasAssigned = inbox.body.data.some((n) => n.type === "issue_assigned");
  assert.equal(hasAssigned, false);
});
