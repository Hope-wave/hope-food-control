const test = require("node:test");
const assert = require("node:assert/strict");

const { buildAdminDashboardPdfPayload } = require("../src/dashboardExport");

test("monta o resumo de relatório administrativo com métricas e estoque atual", () => {
  const payload = buildAdminDashboardPdfPayload({
    month: { label: "Julho/2026" },
    metrics: {
      entries: 14,
      foodOutputs: 9,
      baskets: 4,
      stockUnits: 68,
      foodTypesInStock: 12,
      expiringSoon: 3,
      expired: 1,
      averageItemsPerBasket: 5.4
    },
    stockByCategory: [
      { label: "Arroz", quantity: 20 },
      { label: "Feijão", quantity: 18 },
      { label: "Leite", quantity: 10 }
    ],
    stockByFood: [
      { name: "Arroz", quantity: 20 },
      { name: "Feijão", quantity: 18 }
    ]
  });

  assert.equal(payload.title, "Relatório administrativo - Base Hope");
  assert.equal(payload.monthLabel, "Julho/2026");
  assert.deepEqual(payload.summaryRows, [
    ["Entradas no mês", 14],
    ["Saídas de alimentos", 9],
    ["Cestas entregues", 4],
    ["Estoque atual", 68],
    ["Tipos em estoque", 12],
    ["Próximos do vencimento", 3],
    ["Vencidos no estoque", 1],
    ["Média por cesta", 5.4]
  ]);
  assert.deepEqual(payload.stockCategoryRows, [
    ["Arroz", 20],
    ["Feijão", 18],
    ["Leite", 10]
  ]);
  assert.deepEqual(payload.stockFoodRows, [
    ["Arroz", 20],
    ["Feijão", 18]
  ]);
});
