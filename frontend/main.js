const output = document.getElementById("output");
const orgContext = document.getElementById("org-context");

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
    orgContext.textContent = `Current org: ${response.json.slug}`;
    window.history.replaceState({}, "", `/${response.json.slug}/`);
  }
});

document.getElementById("refresh").addEventListener("click", async () => {
  write(await post("/api/v1/auth/refresh"));
});

document.getElementById("logout").addEventListener("click", async () => {
  write(await post("/api/v1/auth/logout"));
});
