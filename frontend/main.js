const output = document.getElementById("output");
const orgContext = document.getElementById("org-context");
let currentOrgId = null;
let currentTeamId = null;
let currentProjectId = null;

function write(data) {
  output.textContent = JSON.stringify(data, null, 2);
}

async function post(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, json };
}

document.getElementById("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  write(await post("/api/v1/auth/login", { email, password }));
});

document.getElementById("org-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("org-name").value;
  const response = await post("/api/v1/organisations", { name });
  write(response);
  if (response.status === 201) {
    currentOrgId = response.json.id;
    orgContext.textContent = `Current org: ${response.json.slug}`;
    window.history.replaceState({}, "", `/${response.json.slug}/`);
  }
});

document.getElementById("team-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentOrgId) {
    write({ status: 400, json: { detail: "Create organisation first" } });
    return;
  }
  const name = document.getElementById("team-name").value;
  const identifier = document.getElementById("team-identifier").value;
  const response = await post(`/api/v1/organisations/${currentOrgId}/teams`, { name, identifier });
  write(response);
  if (response.status === 201) {
    currentTeamId = response.json.id;
  }
});

document.getElementById("member-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentTeamId) {
    write({ status: 400, json: { detail: "Create team first" } });
    return;
  }
  const userId = document.getElementById("member-user-id").value;
  const role = document.getElementById("member-role").value;
  write(await post(`/api/v1/teams/${currentTeamId}/members`, { userId, role }));
});

document.getElementById("team-settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentTeamId) {
    write({ status: 400, json: { detail: "Create team first" } });
    return;
  }
  const identifier = document.getElementById("team-settings-identifier").value;
  const res = await fetch(`/api/v1/teams/${currentTeamId}/settings`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier }),
  });
  write({ status: res.status, json: await res.json() });
});

document.getElementById("remove-member").addEventListener("click", async () => {
  if (!currentTeamId) {
    write({ status: 400, json: { detail: "Create team first" } });
    return;
  }
  const userId = document.getElementById("member-user-id").value;
  const res = await fetch(`/api/v1/teams/${currentTeamId}/members/${userId}`, {
    method: "DELETE",
    credentials: "include",
  });
  write({ status: res.status, json: { ok: res.ok } });
});

document.getElementById("project-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentTeamId) {
    write({ status: 400, json: { detail: "Create team first" } });
    return;
  }
  const name = document.getElementById("project-name").value;
  const response = await post(`/api/v1/teams/${currentTeamId}/projects`, {
    name,
    status: "planning",
    color: "#111827",
  });
  write(response);
  if (response.status === 201) {
    currentProjectId = response.json.id;
  }
});

document.getElementById("project-search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentTeamId) {
    write({ status: 400, json: { detail: "Create team first" } });
    return;
  }
  const q = encodeURIComponent(document.getElementById("project-search").value);
  const status = encodeURIComponent(document.getElementById("project-status-filter").value);
  const res = await fetch(`/api/v1/teams/${currentTeamId}/projects?q=${q}&status=${status}`, {
    method: "GET",
    credentials: "include",
  });
  write({ status: res.status, json: await res.json() });
});

document.getElementById("load-project-detail").addEventListener("click", async () => {
  if (!currentProjectId || !currentTeamId) {
    write({ status: 400, json: { detail: "Create project first" } });
    return;
  }
  const res = await fetch(`/api/v1/projects/${currentProjectId}?teamId=${encodeURIComponent(currentTeamId)}`, {
    method: "GET",
    credentials: "include",
  });
  write({ status: res.status, json: await res.json() });
});

document.getElementById("label-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentTeamId) {
    write({ status: 400, json: { detail: "Create team first" } });
    return;
  }
  const name = document.getElementById("label-name").value;
  write(await post(`/api/v1/teams/${currentTeamId}/labels`, { name, color: "#0ea5e9" }));
});

document.getElementById("state-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentTeamId) {
    write({ status: 400, json: { detail: "Create team first" } });
    return;
  }
  const name = document.getElementById("state-name").value;
  const type = document.getElementById("state-type").value;
  write(await post(`/api/v1/teams/${currentTeamId}/workflow-states`, { name, type, color: "#9333ea" }));
});

document.getElementById("reorder-states").addEventListener("click", async () => {
  if (!currentTeamId) {
    write({ status: 400, json: { detail: "Create team first" } });
    return;
  }
  const listRes = await fetch(`/api/v1/teams/${currentTeamId}/workflow-states`, {
    method: "GET",
    credentials: "include",
  });
  const list = await listRes.json();
  const orderedIds = list.map((item) => item.id).reverse();
  write(await post(`/api/v1/teams/${currentTeamId}/workflow-states/reorder`, { orderedIds }));
});

document.getElementById("update-project").addEventListener("click", async () => {
  if (!currentProjectId) {
    write({ status: 400, json: { detail: "Create project first" } });
    return;
  }
  const res = await fetch(`/api/v1/projects/${currentProjectId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "active",
      targetDate: "2026-05-01",
      externalLinks: [{ label: "Spec", url: "https://example.com/spec" }],
    }),
  });
  write({ status: res.status, json: await res.json() });
});

document.getElementById("archive-project").addEventListener("click", async () => {
  if (!currentProjectId) {
    write({ status: 400, json: { detail: "Create project first" } });
    return;
  }
  write(await post(`/api/v1/projects/${currentProjectId}/archive`));
});

document.getElementById("refresh").addEventListener("click", async () => {
  write(await post("/api/v1/auth/refresh"));
});

document.getElementById("logout").addEventListener("click", async () => {
  write(await post("/api/v1/auth/logout"));
});
