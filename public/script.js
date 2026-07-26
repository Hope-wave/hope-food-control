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
const dashboardMonth = document.getElementById("dashboard-month");
const metricEntries = document.getElementById("metric-entries");
const metricFoodOutputs = document.getElementById("metric-food-outputs");
const metricBaskets = document.getElementById("metric-baskets");
const metricStockUnits = document.getElementById("metric-stock-units");
const metricFoodTypes = document.getElementById("metric-food-types");
const metricExpiringSoon = document.getElementById("metric-expiring-soon");
const metricExpired = document.getElementById("metric-expired");
const metricAverageBasket = document.getElementById("metric-average-basket");
const dashboardMonthSelect = document.getElementById("dashboard-month-select");
const entryCategoryPie = document.getElementById("entry-category-pie");
const entryCategoryPieTotal = document.getElementById("entry-category-pie-total");
const entryCategoryLegend = document.getElementById("entry-category-legend");
const stockCategoryPie = document.getElementById("stock-category-pie");
const stockCategoryPieTotal = document.getElementById("stock-category-pie-total");
const stockCategoryLegend = document.getElementById("stock-category-legend");
const stockFoodList = document.getElementById("stock-food-list");
const movementChart = document.getElementById("movement-chart");
const confirmationDialog = document.getElementById("confirmation-dialog");
const confirmationTitle = document.getElementById("confirmation-title");
const confirmationMessage = document.getElementById("confirmation-message");
const confirmationDetails = document.getElementById("confirmation-details");
const confirmationConfirmBtn = document.getElementById("confirmation-confirm-btn");

const FOODS_PAGE_SIZE = 10;
const ALERTS_PAGE_SIZE = 8;
const CATEGORY_CHART_COLORS = ["#1a37e6", "#20a36a", "#e59b1f", "#8c4fe8", "#df5a7c", "#1987bb"];
let foodsPage = 1;
let alertsPage = 1;
let allFoods = [];
let allAlerts = [];
let confirmationResolver = null;
let selectedDashboardMonth = "";

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

function showMessage(container, text, isError = false, isWarning = false) {
  container.classList.remove("hidden", "error", "warning");
  if (isError) container.classList.add("error");
  if (isWarning) container.classList.add("warning");
  container.textContent = text;
}

function requestConfirmation({ title, message, details, confirmLabel }) {
  if (confirmationDialog.open) {
    return Promise.resolve(false);
  }

  confirmationTitle.textContent = title;
  confirmationMessage.textContent = message;
  confirmationConfirmBtn.textContent = confirmLabel;
  confirmationDetails.innerHTML = "";

  details.forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    confirmationDetails.append(term, description);
  });

  return new Promise((resolve) => {
    confirmationResolver = resolve;
    confirmationDialog.showModal();
  });
}

confirmationDialog.addEventListener("close", () => {
  if (confirmationResolver) {
    const resolve = confirmationResolver;
    confirmationResolver = null;
    resolve(confirmationDialog.returnValue === "confirm");
  }
});

confirmationDialog.addEventListener("click", (event) => {
  if (event.target === confirmationDialog) {
    confirmationDialog.close("cancel");
  }
});

function showApp(user) {
  currentUser = user;
  document.body.classList.remove("auth-mode");
  loginSection.classList.add("hidden");
  appSection.classList.remove("hidden");
  const roleLabel = user.role === "admin" ? "Administrador" : "Voluntário";
  welcomeText.textContent = `Usuário: ${user.username} | Perfil: ${roleLabel}`;

  const showBasket = user.role === "volunteer" || user.role === "admin";
  basketPanel.classList.toggle("hidden", !showBasket);

  const canManageFoods = user.role === "volunteer" || user.role === "admin";
  volunteerPanel.classList.toggle("hidden", !canManageFoods);
  adminPanel.classList.toggle("hidden", user.role !== "admin");
}

function showLogin() {
  currentUser = null;
  lastBasketPlan = null;
  document.body.classList.add("auth-mode");
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

function renderDashboardMonthSelect(months, selectedMonth) {
  dashboardMonthSelect.innerHTML = "";
  (months || []).forEach((month) => {
    const option = document.createElement("option");
    option.value = month.key;
    option.textContent = month.label;
    option.selected = month.key === selectedMonth;
    dashboardMonthSelect.appendChild(option);
  });
  dashboardMonthSelect.disabled = !months?.length;
}

function renderCategoryPieChart({
  categories,
  pie,
  totalElement,
  legend,
  emptyMessage,
  ariaLabel
}) {
  const chartCategories = (categories || []).filter(
    (category) => Number(category.quantity) > 0
  );
  const total = chartCategories.reduce(
    (sum, category) => sum + Number(category.quantity),
    0
  );

  legend.innerHTML = "";
  pie.classList.toggle("is-empty", total === 0);
  totalElement.textContent = `${total} un.`;

  if (!total) {
    pie.style.background = "";
    pie.setAttribute("aria-label", emptyMessage);
    const emptyItem = document.createElement("li");
    emptyItem.className = "category-pie-empty";
    emptyItem.textContent = emptyMessage;
    legend.appendChild(emptyItem);
    return;
  }

  let start = 0;
  const slices = chartCategories.map((category, index) => {
    const end = start + (Number(category.quantity) / total) * 100;
    const color = CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length];
    const slice = `${color} ${start}% ${end}%`;
    start = end;
    return slice;
  });
  pie.style.background = `conic-gradient(${slices.join(", ")})`;
  pie.setAttribute(
    "aria-label",
    `${ariaLabel}: ${chartCategories
      .map((category) => `${category.label}: ${category.quantity} unidades`)
      .join(", ")}`
  );

  chartCategories.forEach((category, index) => {
    const item = document.createElement("li");
    const color = CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length];
    const percentage = Math.round((Number(category.quantity) / total) * 100);
    const marker = document.createElement("i");
    marker.style.backgroundColor = color;
    const text = document.createElement("span");
    text.textContent = category.label;
    const value = document.createElement("strong");
    value.textContent = `${category.quantity} un. (${percentage}%)`;
    item.append(marker, text, value);
    legend.appendChild(item);
  });
}

function renderEntryCategoryChart(categories) {
  renderCategoryPieChart({
    categories,
    pie: entryCategoryPie,
    totalElement: entryCategoryPieTotal,
    legend: entryCategoryLegend,
    emptyMessage: "Nenhuma entrada registrada neste mês.",
    ariaLabel: "Categorias que entraram no mês"
  });
}

function renderStockCategoryChart(categories) {
  renderCategoryPieChart({
    categories,
    pie: stockCategoryPie,
    totalElement: stockCategoryPieTotal,
    legend: stockCategoryLegend,
    emptyMessage: "Nenhum alimento disponível no estoque.",
    ariaLabel: "Estoque por categoria"
  });
}

function renderStockFoodList(foods) {
  stockFoodList.innerHTML = "";
  if (!foods?.length) {
    stockFoodList.textContent = "Nenhum alimento disponível no estoque.";
    return;
  }

  const maxQuantity = Math.max(...foods.map((food) => food.quantity), 1);
  foods.forEach((food) => {
    const item = document.createElement("div");
    item.className = "stock-food-item";
    const line = document.createElement("div");
    line.className = "stock-food-line";
    const name = document.createElement("span");
    name.textContent = food.name;
    const quantity = document.createElement("strong");
    quantity.textContent = `${food.quantity} un.`;
    line.append(name, quantity);
    const track = document.createElement("div");
    track.className = "stock-food-track";
    const fill = document.createElement("span");
    fill.style.width = `${(food.quantity / maxQuantity) * 100}%`;
    track.appendChild(fill);
    item.append(line, track);
    stockFoodList.appendChild(item);
  });
}

function renderMovementChart(history) {
  movementChart.innerHTML = "";
  if (!history?.length) {
    movementChart.textContent = "Ainda não há movimentações registradas.";
    return;
  }

  const highestValue = Math.max(
    ...history.flatMap((month) => [month.entries, month.foodOutputs, month.baskets]),
    1
  );
  history.forEach((month) => {
    const item = document.createElement("div");
    item.className = "movement-chart-item";
    const label = document.createElement("span");
    label.className = "movement-chart-label";
    label.textContent = month.label;
    const bars = document.createElement("div");
    bars.className = "movement-bars";
    [
      ["entry", month.entries, "Entradas"],
      ["output", month.foodOutputs, "Saídas"],
      ["basket", month.baskets, "Cestas"]
    ].forEach(([type, value, labelText]) => {
      const bar = document.createElement("span");
      bar.className = `movement-bar ${type}`;
      bar.style.width = `${(value / highestValue) * 100}%`;
      bar.title = `${labelText}: ${value}`;
      bar.setAttribute("aria-label", `${labelText}: ${value}`);
      bars.appendChild(bar);
    });
    item.append(label, bars);
    movementChart.appendChild(item);
  });
}

function renderDashboard(data) {
  const metrics = data.metrics || {};
  const month = data.month || {};
  selectedDashboardMonth = month.key || "";
  dashboardMonth.textContent = `Dados de ${month.label || "mês atual"}`;
  metricEntries.textContent = metrics.entries ?? 0;
  metricFoodOutputs.textContent = metrics.foodOutputs ?? 0;
  metricBaskets.textContent = metrics.baskets ?? 0;
  metricStockUnits.textContent = metrics.stockUnits ?? 0;
  metricFoodTypes.textContent = metrics.foodTypesInStock ?? 0;
  metricExpiringSoon.textContent = metrics.expiringSoon ?? 0;
  metricExpired.textContent = metrics.expired ?? 0;
  metricAverageBasket.textContent = metrics.averageItemsPerBasket ?? 0;
  renderDashboardMonthSelect(data.months, selectedDashboardMonth);
  renderEntryCategoryChart(data.entryCategories);
  renderStockCategoryChart(data.stockByCategory);
  renderStockFoodList(data.stockByFood);
  renderMovementChart(data.history);
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
        <td><span class="basket-food-id">${item.foodId}</span></td>
        <td>${item.foodName}</td>
        <td>${formatDatePtBr(item.validityDate)}</td>
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

  const missing = (plan.missingBase || []).map((m) => m.label).join(", ");

  if (!plan.canAssemble) {
    showMessage(
      basketResult,
      "Não há alimentos disponíveis para registrar a saída da cesta.",
      true
    );
    basketHint.textContent =
      "Cadastre alimentos no estoque antes de registrar uma saída de cesta.";
    basketHint.classList.remove("hidden");
    basketCheckoutBtn.disabled = true;
    return;
  }

  if (missing) {
    showMessage(
      basketResult,
      `Atenção: faltam itens obrigatórios no estoque: ${missing}. A saída será registrada com os itens disponíveis.`,
      false,
      true
    );
    basketHint.textContent =
      "Você pode continuar. Reponha os itens faltantes assim que possível para completar as próximas cestas.";
    basketHint.classList.remove("hidden");
    basketCheckoutBtn.disabled = false;
    return;
  }

  basketHint.classList.add("hidden");
  basketResult.classList.add("hidden");
  basketCheckoutBtn.disabled = false;
}

async function loadAdminData() {
  try {
    const dashboardQuery = selectedDashboardMonth
      ? `?month=${encodeURIComponent(selectedDashboardMonth)}`
      : "";
    const [foodsData, alertsData, dashboardData] = await Promise.all([
      api("/api/admin/foods"),
      api("/api/admin/alerts"),
      api(`/api/admin/dashboard${dashboardQuery}`)
    ]);
    allFoods = foodsData.foods || [];
    allAlerts = alertsData.alerts || [];
    foodsPage = 1;
    alertsPage = 1;
    renderFoods(allFoods);
    renderAlerts(allAlerts);
    renderDashboard(dashboardData);
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

const passwordInput = document.getElementById("password");
const togglePasswordBtn = document.getElementById("toggle-password");

if (togglePasswordBtn && passwordInput) {
  togglePasswordBtn.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    togglePasswordBtn.setAttribute("aria-label", isHidden ? "Ocultar senha" : "Mostrar senha");
    togglePasswordBtn.querySelector(".icon-eye").classList.toggle("hidden", !isHidden);
    togglePasswordBtn.querySelector(".icon-eye-off").classList.toggle("hidden", isHidden);
  });
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

    const confirmed = await requestConfirmation({
      title: "Confirmar cadastro de alimento",
      message: "Revise os dados antes de salvar no estoque.",
      details: [
        ["Alimento", body.name],
        ["Peso", body.weight != null ? `${body.weight} kg` : "Não informado"],
        ["Validade", formatDatePtBr(body.validityDate)]
      ],
      confirmLabel: "Confirmar cadastro"
    });
    if (!confirmed) {
      return;
    }

    const created = await api("/api/foods", {
      method: "POST",
      body
    });
    foodForm.reset();
    showMessage(foodResult, `Alimento salvo. ID para etiqueta: ${created.id}`);
    if (currentUser?.role === "admin") {
      await loadAdminData();
    }
  } catch (error) {
    showMessage(foodResult, error.message, true);
  }
});

outputForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(outputForm);

  try {
    const foodId = String(formData.get("id")).toUpperCase().trim();
    const confirmed = await requestConfirmation({
      title: "Confirmar baixa de alimento",
      message: "Esta operação reduzirá uma unidade do estoque.",
      details: [
        ["ID da etiqueta", foodId],
        ["Quantidade de saída", "1 unidade"]
      ],
      confirmLabel: "Confirmar baixa"
    });
    if (!confirmed) {
      return;
    }

    const output = await api("/api/foods/output", {
      method: "POST",
      body: {
        id: foodId,
        quantityOut: 1
      }
    });
    outputForm.reset();
    showMessage(
      outputResult,
      `Saída registrada. ID: ${output.foodId} | Estoque restante: ${output.quantityRemaining}`
    );
    if (currentUser?.role === "admin") {
      await loadAdminData();
    }
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

dashboardMonthSelect.addEventListener("change", async () => {
  selectedDashboardMonth = dashboardMonthSelect.value;
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
    const itemCount = lastBasketPlan.summary?.totalLines || 0;
    const confirmed = await requestConfirmation({
      title: "Confirmar saída da cesta",
      message: "Os itens listados serão baixados do estoque.",
      details: [
        ["Itens da cesta", `${itemCount} item(ns)`],
        ["Observações", basketNotes.value.trim() || "Não informado"]
      ],
      confirmLabel: "Confirmar saída"
    });
    if (!confirmed) {
      return;
    }

    const output = await api("/api/baskets/basic/checkout", {
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
    const missing = (output.missingBase || []).map((item) => item.label).join(", ");
    showMessage(
      basketResult,
      missing
        ? `Baixa registrada com os itens disponíveis. Faltaram: ${missing}.`
        : "Baixa da cesta registrada. Cada item foi descontado no cadastro de alimentos.",
      false,
      Boolean(missing)
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
