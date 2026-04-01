const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { app } = require("../../backend/src/server");

async function createOrgAndTeam(agent, orgName, teamName, identifier) {
  const org = await agent.post("/api/v1/organisations").send({ name: orgName });
  const team = await agent
    .post(`/api/v1/organisations/${org.body.id}/teams`)
    .send({ name: teamName, identifier });
  return { org, team };
}

test("team identifier can be updated with validation and uniqueness", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });

  const first = await createOrgAndTeam(agent, "One Org", "Team A", "TEAMA");
  const second = await createOrgAndTeam(agent, "Two Org", "Team B", "TEAMB");

  const duplicate = await agent
    .patch(`/api/v1/teams/${second.team.body.id}/settings`)
    .send({ identifier: "TEAMA" });
  assert.equal(duplicate.status, 400);

  const updated = await agent
    .patch(`/api/v1/teams/${second.team.body.id}/settings`)
    .send({ identifier: "OPS_1" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.identifier, "OPS_1");

  assert.equal(first.team.status, 201);
});

test("new team gets default ordered workflow states", async () => {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({
    email: "admin@example.com",
    password: "password123",
  });

  const { team } = await createOrgAndTeam(agent, "States Org", "Team Defaults", "STATE1");
  const states = await agent.get(`/api/v1/teams/${team.body.id}/workflow-states`);

  assert.equal(states.status, 200);
  assert.equal(states.body.length, 4);
  assert.deepEqual(
    states.body.map((item) => item.type),
    ["backlog", "unstarted", "started", "completed"],
  );
});
