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
const exportPdfBtn = document.getElementById("export-pdf-btn");

const foodResult = document.getElementById("food-result");
const outputResult = document.getElementById("output-result");
const foodsTbody = document.getElementById("foods-tbody");
const alertsList = document.getElementById("alerts-list");
const loginResult = document.getElementById("login-result");
const foodsPagination = document.getElementById("foods-pagination");
const foodsPrevBtn = document.getElementById("foods-prev-btn");
const foodsNextBtn = document.getElementById("foods-next-btn");
const foodsPageInfo = document.getElementById("foods-page-info");
const alertsPagination = document.getElementById("alerts-pagination");
const alertsPrevBtn = document.getElementById("alerts-prev-btn");
const alertsNextBtn = document.getElementById("alerts-next-btn");
const alertsPageInfo = document.getElementById("alerts-page-info");

const FOODS_PAGE_SIZE = 10;
const ALERTS_PAGE_SIZE = 8;
let foodsPage = 1;
let alertsPage = 1;
let allFoods = [];
let allAlerts = [];

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

function formatDatePtBr(dateIso) {
  const raw = String(dateIso || "").trim();
  if (!raw) {
    return "—";
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return raw;
  }
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function formatDateTimePtBr(dateValue) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(dateValue);
}

function updateExportButtonState() {
  if (!exportPdfBtn) {
    return;
  }
  exportPdfBtn.disabled = !allFoods.length;
}

function clampPage(page, totalItems, pageSize) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return Math.min(Math.max(page, 1), totalPages);
}

function updatePaginationControls({
  totalItems,
  page,
  pageSize,
  container,
  prevBtn,
  nextBtn,
  infoEl
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const hasMultiplePages = totalPages > 1;
  container.classList.toggle("hidden", !hasMultiplePages);
  prevBtn.disabled = page <= 1;
  nextBtn.disabled = page >= totalPages;
  infoEl.textContent = `Página ${page} de ${totalPages}`;
}

function renderFoods(foods) {
  foodsTbody.innerHTML = "";
  foodsPage = clampPage(foodsPage, foods.length, FOODS_PAGE_SIZE);
  updateExportButtonState();

  if (!foods.length) {
    foodsTbody.innerHTML = `<tr><td colspan="6">Nenhum alimento com estoque no momento.</td></tr>`;
    foodsPagination.classList.add("hidden");
    return;
  }

  const start = (foodsPage - 1) * FOODS_PAGE_SIZE;
  const pageFoods = foods.slice(start, start + FOODS_PAGE_SIZE);

  pageFoods.forEach((food) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${food.id}</td>
      <td>${food.name}</td>
      <td>${food.quantity}</td>
      <td>${food.weight != null && food.weight !== "" ? food.weight : "—"}</td>
      <td>${formatDatePtBr(food.validityDate)}</td>
      <td><span class="status ${food.status}">${statusLabel(food.status)}</span></td>
    `;
    foodsTbody.appendChild(row);
  });

  updatePaginationControls({
    totalItems: foods.length,
    page: foodsPage,
    pageSize: FOODS_PAGE_SIZE,
    container: foodsPagination,
    prevBtn: foodsPrevBtn,
    nextBtn: foodsNextBtn,
    infoEl: foodsPageInfo
  });
}

function renderAlerts(alerts) {
  alertsList.innerHTML = "";
  alertsPage = clampPage(alertsPage, alerts.length, ALERTS_PAGE_SIZE);

  if (!alerts.length) {
    alertsList.innerHTML = "<li>Nenhum alerta de vencimento.</li>";
    alertsPagination.classList.add("hidden");
    return;
  }

  const start = (alertsPage - 1) * ALERTS_PAGE_SIZE;
  const pageAlerts = alerts.slice(start, start + ALERTS_PAGE_SIZE);

  pageAlerts.forEach((food) => {
    const item = document.createElement("li");
    item.textContent = `${food.id} - ${food.name} vence em ${food.daysToExpire} dia(s)`;
    alertsList.appendChild(item);
  });

  updatePaginationControls({
    totalItems: alerts.length,
    page: alertsPage,
    pageSize: ALERTS_PAGE_SIZE,
    container: alertsPagination,
    prevBtn: alertsPrevBtn,
    nextBtn: alertsNextBtn,
    infoEl: alertsPageInfo
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
        <td>${formatDatePtBr(item.validityDate)}</td>
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
    allFoods = foodsData.foods || [];
    allAlerts = alertsData.alerts || [];
    foodsPage = 1;
    alertsPage = 1;
    renderFoods(allFoods);
    renderAlerts(allAlerts);
  } catch (error) {
    alertsList.innerHTML = `<li>${error.message}</li>`;
    allFoods = [];
    updateExportButtonState();
  }
}

function exportFoodsPdf() {
  if (!allFoods.length) {
    showMessage(outputResult, "Nao ha itens no estoque para exportar.", true);
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    showMessage(outputResult, "Biblioteca de PDF nao carregada no navegador.", true);
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const generatedAt = new Date();

  doc.setFontSize(14);
  doc.text("Base Hope - Estoque completo", 40, 38);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${formatDateTimePtBr(generatedAt)}`, 40, 56);

  const tableRows = allFoods.map((food) => [
    food.id,
    food.name,
    String(food.quantity),
    food.weight != null && food.weight !== "" ? String(food.weight) : "-",
    formatDatePtBr(food.validityDate),
    statusLabel(food.status)
  ]);

  doc.autoTable({
    startY: 72,
    head: [["ID", "Nome", "Quantidade", "Peso (kg)", "Validade", "Status"]],
    body: tableRows,
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [99, 52, 218] }
  });

  const stamp = generatedAt.toISOString().slice(0, 10);
  doc.save(`estoque-completo-${stamp}.pdf`);
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
      quantity: 1,
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
        quantityOut: 1
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

if (exportPdfBtn) {
  exportPdfBtn.addEventListener("click", exportFoodsPdf);
}

foodsPrevBtn.addEventListener("click", () => {
  foodsPage -= 1;
  renderFoods(allFoods);
});

foodsNextBtn.addEventListener("click", () => {
  foodsPage += 1;
  renderFoods(allFoods);
});

alertsPrevBtn.addEventListener("click", () => {
  alertsPage -= 1;
  renderAlerts(allAlerts);
});

alertsNextBtn.addEventListener("click", () => {
  alertsPage += 1;
  renderAlerts(allAlerts);
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
