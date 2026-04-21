const loginSection = document.getElementById("login-section");
const appSection = document.getElementById("app-section");
const basketPanel = document.getElementById("basket-panel");
const volunteerPanel = document.getElementById("volunteer-panel");
const adminPanel = document.getElementById("admin-panel");
const welcomeText = document.getElementById("welcome-text");

const basketPlanBtn = document.getElementById("basket-plan-btn");
const basketCheckoutBtn = document.getElementById("basket-checkout-btn");
const basketNotes = document.getElementById("basket-notes");
const basketResult = document.getElementById("basket-result");
const basketHint = document.getElementById("basket-hint");
const basketTableWrap = document.getElementById("basket-table-wrap");
const basketPlanTbody = document.getElementById("basket-plan-tbody");
const basketSkippedList = document.getElementById("basket-skipped-list");

let currentUser = null;
let lastBasketPlan = null;

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

function getApiOrigin() {
  const el = document.querySelector('meta[name="hope-api-origin"]');
  const raw = (el?.getAttribute("content") || "").trim();
  if (raw && raw !== "__HOPE_API_ORIGIN__") {
    return raw.replace(/\/$/, "");
  }
  const { hostname, port, protocol } = window.location;
  const p = port || (protocol === "https:" ? "443" : "80");
  const liveServerLike = new Set(["5500", "5501", "8080", "5173", "4173"]);
  if (liveServerLike.has(String(p))) {
    return `${protocol}//${hostname}:3000`.replace(/\/$/, "");
  }
  return "";
}

function resolveApiUrl(path) {
  const origin = getApiOrigin();
  if (!origin) {
    return path;
  }
  if (path.startsWith("http")) {
    return path;
  }
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function apiCredentialsForFetch() {
  const origin = getApiOrigin();
  if (!origin) {
    return "same-origin";
  }
  const pageOrigin = `${window.location.protocol}//${window.location.host}`.replace(
    /\/$/,
    ""
  );
  return origin === pageOrigin ? "same-origin" : "include";
}

async function api(path, options = {}) {
  const url = resolveApiUrl(path);
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    credentials: apiCredentialsForFetch(),
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const rawText = await response.text();
  const trimmed = rawText.trim();
  const contentType = response.headers.get("content-type") || "";
  const looksJson =
    contentType.includes("application/json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  let data = {};
  if (trimmed) {
    if (looksJson) {
      try {
        data = JSON.parse(rawText);
      } catch (_err) {
        throw new Error("Resposta do servidor não é JSON válido.");
      }
    } else if (trimmed.startsWith("<!") || trimmed.startsWith("<html")) {
      throw new Error(
        "O servidor devolveu a página HTML em vez da API. Abra o sistema pela mesma URL do Node " +
          "(ex.: http://localhost:3000), não por outro servidor estático, e reinicie com npm run dev."
      );
    }
  }

  if (!response.ok) {
    if (trimmed.startsWith("<!") || trimmed.toLowerCase().startsWith("<html")) {
      throw new Error(
        "O servidor devolveu uma página HTML no erro. Use a URL do aplicativo Node " +
          "(ex.: http://localhost:3000) e reinicie com npm run dev."
      );
    }
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
  currentUser = user;
  loginSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  const roleLabel = user.role === "admin" ? "Administrador" : "Voluntário";
  welcomeText.textContent = `Usuário: ${user.username} | Perfil: ${roleLabel}`;

  const showBasket = user.role === "volunteer" || user.role === "admin";
  basketPanel.classList.toggle("hidden", !showBasket);

  volunteerPanel.classList.toggle("hidden", user.role !== "volunteer");
  adminPanel.classList.toggle("hidden", user.role !== "admin");
}

function showLogin() {
  currentUser = null;
  lastBasketPlan = null;
  appSection.classList.add("hidden");
  loginSection.classList.remove("hidden");
  basketPanel.classList.add("hidden");
  volunteerPanel.classList.add("hidden");
  adminPanel.classList.add("hidden");
  loginResult.classList.add("hidden");
  basketCheckoutBtn.disabled = true;
  basketNotes.value = "";
  basketTableWrap.classList.add("hidden");
  basketSkippedList.classList.add("hidden");
  basketSkippedList.innerHTML = "";
  basketPlanTbody.innerHTML = "";
  basketHint.classList.add("hidden");
  basketResult.classList.add("hidden");
}

function statusLabel(status) {
  if (status === "proximo") return "Próximo do vencimento";
  if (status === "vencido") return "Vencido";
  return "Normal";
}

function renderFoods(foods) {
  foodsTbody.innerHTML = "";
  if (!foods.length) {
    foodsTbody.innerHTML = `<tr><td colspan="6">Nenhum alimento com estoque no momento.</td></tr>`;
    return;
  }

  foods.forEach((food) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${food.id}</td>
      <td>${food.name}</td>
      <td>${food.quantity}</td>
      <td>${food.weight != null && food.weight !== "" ? food.weight : "—"}</td>
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

function formatDaysLabel(days) {
  if (days === null || days === undefined) {
    return "—";
  }
  if (days < 0) {
    return `${days} (vencido)`;
  }
  return String(days);
}

function renderBasketPlan(plan) {
  basketPlanTbody.innerHTML = "";
  const rows = plan.pickList?.length
    ? plan.pickList
    : [...(plan.baseItems || []), ...(plan.optionalIncluded || [])];

  if (!rows.length) {
    basketTableWrap.classList.add("hidden");
  } else {
    basketTableWrap.classList.remove("hidden");
    rows.forEach((item) => {
      const isBase =
        item.kind === "base" ||
        (item.kind === undefined &&
          plan.baseItems?.some(
            (b) => b.foodId === item.foodId && b.categoryKey === item.categoryKey
          ));
      const orderCell = item.order != null ? item.order : "—";
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${orderCell}</td>
        <td><span class="basket-pill ${isBase ? "base" : "extra"}">${isBase ? "Base" : "Adicional"}</span></td>
        <td>${item.categoryLabel}</td>
        <td><span class="basket-food-id">${item.foodId}</span></td>
        <td>${item.foodName}</td>
        <td>${item.validityDate}</td>
        <td>${formatDaysLabel(item.daysToExpire)}</td>
        <td>${item.quantityOut}</td>
      `;
      basketPlanTbody.appendChild(row);
    });
  }

  basketSkippedList.innerHTML = "";
  const skipped = plan.optionalSkipped || [];
  if (skipped.length) {
    basketSkippedList.classList.remove("hidden");
    skipped.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = `${s.label}: ${s.reason}`;
      basketSkippedList.appendChild(li);
    });
  } else {
    basketSkippedList.classList.add("hidden");
  }

  if (!plan.canAssemble) {
    const missing = (plan.missingBase || [])
      .map((m) => m.label)
      .join(", ");
    showMessage(
      basketResult,
      `Faltam itens obrigatórios no estoque: ${missing}. Cadastre ou repor estoque antes de dar baixa.`,
      true
    );
    basketHint.textContent =
      "Dica: use nomes claros no cadastro (ex.: “Arroz tipo 1”, “Feijão carioca”) para o sistema reconhecer a base.";
    basketHint.classList.remove("hidden");
    basketCheckoutBtn.disabled = true;
    return;
  }

  basketHint.classList.add("hidden");
  showMessage(
    basketResult,
    `Lista para montagem: ${plan.summary?.totalLines || rows.length} item(ns) com ID da etiqueta. Ordem = validade mais próxima primeiro (FEFO).`,
    false
  );
  basketCheckoutBtn.disabled = false;
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
    const weightRaw = formData.get("weight");
    const weightTrimmed =
      weightRaw === null || weightRaw === undefined
        ? ""
        : String(weightRaw).trim();
    const body = {
      name: formData.get("name"),
      quantity: Number(formData.get("quantity")),
      validityDate: formData.get("validityDate")
    };
    if (weightTrimmed !== "") {
      body.weight = Number(weightTrimmed);
    }

    const created = await api("/api/foods", {
      method: "POST",
      body
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

basketPlanBtn.addEventListener("click", async () => {
  basketCheckoutBtn.disabled = true;
  lastBasketPlan = null;
  try {
    const plan = await api("/api/baskets/basic/plan");
    lastBasketPlan = plan;
    renderBasketPlan(plan);
  } catch (error) {
    basketTableWrap.classList.add("hidden");
    basketSkippedList.classList.add("hidden");
    basketHint.classList.add("hidden");
    showMessage(basketResult, error.message, true);
  }
});

basketCheckoutBtn.addEventListener("click", async () => {
  if (!lastBasketPlan?.canAssemble) {
    showMessage(
      basketResult,
      "Calcule a montagem novamente antes de registrar a saída.",
      true
    );
    return;
  }

  try {
    await api("/api/baskets/basic/checkout", {
      method: "POST",
      body: { notes: basketNotes.value }
    });
    basketNotes.value = "";
    lastBasketPlan = null;
    basketCheckoutBtn.disabled = true;
    basketTableWrap.classList.add("hidden");
    basketPlanTbody.innerHTML = "";
    basketSkippedList.classList.add("hidden");
    basketSkippedList.innerHTML = "";
    showMessage(
      basketResult,
      "Baixa da cesta registrada. Cada item foi descontado no cadastro de alimentos.",
      false
    );
    if (currentUser?.role === "admin") {
      await loadAdminData();
    }
  } catch (error) {
    showMessage(basketResult, error.message, true);
  }
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
