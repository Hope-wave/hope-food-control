const loginSection = document.getElementById("login-section");
const appSection = document.getElementById("app-section");
const volunteerPanel = document.getElementById("volunteer-panel");
const adminPanel = document.getElementById("admin-panel");
const welcomeText = document.getElementById("welcome-text");

const loginForm = document.getElementById("login-form");
const foodForm = document.getElementById("food-form");
const outputForm = document.getElementById("output-form");
const logoutBtn = document.getElementById("logout-btn");
const refreshAdminBtn = document.getElementById("refresh-admin-btn");

const foodResult = document.getElementById("food-result");
const outputResult = document.getElementById("output-result");
const foodsTbody = document.getElementById("foods-tbody");
const alertsList = document.getElementById("alerts-list");
const loginResult = document.getElementById("login-result");

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Erro ao processar requisição.");
  }
  return data;
}

function showMessage(container, text, isError = false) {
  container.classList.remove("hidden", "error");
  if (isError) container.classList.add("error");
  container.textContent = text;
}

function showApp(user) {
  loginSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  const roleLabel = user.role === "admin" ? "Administrador" : "Voluntário";
  welcomeText.textContent = `Usuário: ${user.username} | Perfil: ${roleLabel}`;

  volunteerPanel.classList.toggle("hidden", user.role !== "volunteer");
  adminPanel.classList.toggle("hidden", user.role !== "admin");
}

function showLogin() {
  appSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
  volunteerPanel.classList.add("hidden");
  adminPanel.classList.add("hidden");
  loginResult.classList.add("hidden");
}

function statusLabel(status) {
  if (status === "proximo") return "Próximo do vencimento";
  if (status === "vencido") return "Vencido";
  return "Normal";
}

function renderFoods(foods) {
  foodsTbody.innerHTML = "";
  if (!foods.length) {
    foodsTbody.innerHTML = `<tr><td colspan="6">Nenhum alimento cadastrado.</td></tr>`;
    return;
  }

  foods.forEach((food) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${food.id}</td>
      <td>${food.name}</td>
      <td>${food.quantity}</td>
      <td>${food.weight}</td>
      <td>${food.validityDate}</td>
      <td><span class="status ${food.status}">${statusLabel(food.status)}</span></td>
    `;
    foodsTbody.appendChild(row);
  });
}

function renderAlerts(alerts) {
  alertsList.innerHTML = "";
  if (!alerts.length) {
    alertsList.innerHTML = "<li>Nenhum alerta de vencimento.</li>";
    return;
  }

  alerts.forEach((food) => {
    const item = document.createElement("li");
    item.textContent = `${food.id} - ${food.name} vence em ${food.daysToExpire} dia(s)`;
    alertsList.appendChild(item);
  });
}

async function loadAdminData() {
  try {
    const [foodsData, alertsData] = await Promise.all([
      api("/api/admin/foods"),
      api("/api/admin/alerts")
    ]);
    renderFoods(foodsData.foods);
    renderAlerts(alertsData.alerts);
  } catch (error) {
    alertsList.innerHTML = `<li>${error.message}</li>`;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);

  try {
    const data = await api("/api/login", {
      method: "POST",
      body: {
        username: formData.get("username"),
        password: formData.get("password")
      }
    });
    loginForm.reset();
    loginResult.classList.add("hidden");
    showApp(data.user);
    if (data.user.role === "admin") {
      await loadAdminData();
    }
  } catch (error) {
    showMessage(loginResult, error.message, true);
  }
});

foodForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(foodForm);

  try {
    const created = await api("/api/foods", {
      method: "POST",
      body: {
        name: formData.get("name"),
        quantity: Number(formData.get("quantity")),
        weight: Number(formData.get("weight")),
        validityDate: formData.get("validityDate")
      }
    });
    foodForm.reset();
    showMessage(foodResult, `Alimento salvo. ID para etiqueta: ${created.id}`);
  } catch (error) {
    showMessage(foodResult, error.message, true);
  }
});

outputForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(outputForm);

  try {
    const output = await api("/api/foods/output", {
      method: "POST",
      body: {
        id: String(formData.get("id")).toUpperCase().trim(),
        quantityOut: Number(formData.get("quantityOut"))
      }
    });
    outputForm.reset();
    showMessage(
      outputResult,
      `Saída registrada. ID: ${output.foodId} | Estoque restante: ${output.quantityRemaining}`
    );
  } catch (error) {
    showMessage(outputResult, error.message, true);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await api("/api/logout", { method: "POST" });
  } finally {
    showLogin();
  }
});

refreshAdminBtn.addEventListener("click", async () => {
  await loadAdminData();
});

async function bootstrap() {
  try {
    const data = await api("/api/me");
    if (!data.user) {
      showLogin();
      return;
    }
    showApp(data.user);
    if (data.user.role === "admin") {
      await loadAdminData();
    }
  } catch (_error) {
    showLogin();
  }
}

bootstrap();
