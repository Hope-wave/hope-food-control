function normalizePdfValue(value, fallback = "—") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number(fallback || 0);
  }

  return String(value).replace(/\s+/g, " ").trim() || fallback;
}

function buildAdminDashboardPdfPayload(data = {}) {
  const month = data.month || {};
  const metrics = data.metrics || {};
  const stockByCategory = Array.isArray(data.stockByCategory) ? data.stockByCategory : [];
  const stockByFood = Array.isArray(data.stockByFood) ? data.stockByFood : [];

  return {
    title: "Relatório administrativo - Base Hope",
    monthLabel: normalizePdfValue(month.label || "Mês atual", "Mês atual"),
    summaryRows: [
      ["Entradas no mês", Number(metrics.entries ?? 0)],
      ["Saídas de alimentos", Number(metrics.foodOutputs ?? 0)],
      ["Cestas entregues", Number(metrics.baskets ?? 0)],
      ["Estoque atual", Number(metrics.stockUnits ?? 0)],
      ["Tipos em estoque", Number(metrics.foodTypesInStock ?? 0)],
      ["Próximos do vencimento", Number(metrics.expiringSoon ?? 0)],
      ["Vencidos no estoque", Number(metrics.expired ?? 0)],
      ["Média por cesta", Number(metrics.averageItemsPerBasket ?? 0)]
    ],
    stockCategoryRows: stockByCategory.map((item) => [
      normalizePdfValue(item.label || item.name, "Categoria sem nome"),
      Number(item.quantity ?? 0)
    ]),
    stockFoodRows: stockByFood.map((item) => [
      normalizePdfValue(item.name || item.label, "Alimento sem nome"),
      Number(item.quantity ?? 0)
    ])
  };
}

module.exports = {
  buildAdminDashboardPdfPayload
};
