const output = document.getElementById("output");

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

document.getElementById("refresh").addEventListener("click", async () => {
  write(await post("/api/v1/auth/refresh"));
});

document.getElementById("logout").addEventListener("click", async () => {
  write(await post("/api/v1/auth/logout"));
});
