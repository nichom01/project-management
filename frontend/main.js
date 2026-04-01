const output = document.getElementById("output");
const orgContext = document.getElementById("org-context");
let currentOrgId = null;
let currentTeamId = null;

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

document.getElementById("refresh").addEventListener("click", async () => {
  write(await post("/api/v1/auth/refresh"));
});

document.getElementById("logout").addEventListener("click", async () => {
  write(await post("/api/v1/auth/logout"));
});
