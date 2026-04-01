const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveEffectiveRole,
  canPerform,
  assertAllowed,
} = require("../../backend/src/permission-service");

test("org admin overrides team role to owner", () => {
  assert.equal(resolveEffectiveRole("admin", "guest"), "owner");
});

test("team role is used when org role is member", () => {
  assert.equal(resolveEffectiveRole("member", "member"), "member");
  assert.equal(resolveEffectiveRole("member", "guest"), "guest");
});

test("policy matrix enforces delete_project as owner-only", () => {
  assert.equal(canPerform("delete_project", "owner"), true);
  assert.equal(canPerform("delete_project", "member"), false);
});

test("policy matrix enforces team management as owner-only", () => {
  assert.equal(canPerform("manage_team_members", "owner"), true);
  assert.equal(canPerform("manage_team_members", "member"), false);
});

test("assertAllowed returns allowed=false for insufficient role", () => {
  const result = assertAllowed("create_project", "member", "guest");
  assert.equal(result.allowed, false);
  assert.equal(result.effectiveRole, "guest");
});
