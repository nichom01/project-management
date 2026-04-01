const rolePriority = {
  guest: 0,
  member: 1,
  owner: 2,
};

const policyMatrix = {
  create_project: "member",
  edit_project: "member",
  delete_project: "owner",
};

function resolveEffectiveRole(orgRole, teamRole) {
  // Org admins are implicit owners across all teams.
  if (orgRole === "admin") {
    return "owner";
  }
  return teamRole || "guest";
}

function canPerform(action, effectiveRole) {
  const minimumRole = policyMatrix[action];
  if (!minimumRole) {
    return false;
  }
  return rolePriority[effectiveRole] >= rolePriority[minimumRole];
}

function assertAllowed(action, orgRole, teamRole) {
  const effectiveRole = resolveEffectiveRole(orgRole, teamRole);
  return {
    allowed: canPerform(action, effectiveRole),
    effectiveRole,
  };
}

module.exports = {
  resolveEffectiveRole,
  canPerform,
  assertAllowed,
};
