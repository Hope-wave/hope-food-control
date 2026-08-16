const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getAvailableMonths,
  filterFoodsByValidityRange,
  buildReportRows
} = require("../src/reportPdf");

const foods = [
  { id: "A1", name: "Arroz", validityDate: "2026-08-10", quantity: 5 },
  { id: "B2", name: "Feijão", validityDate: "2026-08-20", quantity: 3 },
  { id: "C3", name: "Leite", validityDate: "2026-09-02", quantity: 4 },
  { id: "D4", name: "Óleo", validityDate: "2026-10-01", quantity: 2 }
];

test("retorna meses disponíveis a partir da data de validade dos alimentos", () => {
  assert.deepEqual(getAvailableMonths(foods), ["2026-08", "2026-09", "2026-10"]);
});

test("filtra alimentos por intervalo de datas de validade", () => {
  const selected = filterFoodsByValidityRange(foods, {
    mode: "days",
    startDate: "2026-08-15",
    endDate: "2026-09-15"
  });

  assert.deepEqual(
    selected.map((food) => food.id),
    ["B2", "C3"]
  );
});

test("filtra alimentos por intervalo de meses selecionados", () => {
  const selected = filterFoodsByValidityRange(foods, {
    mode: "months",
    startMonth: "2026-08",
    endMonth: "2026-09"
  });

  assert.deepEqual(
    selected.map((food) => food.id),
    ["A1", "B2", "C3"]
  );
});

test("constrói linhas do relatório em formato de tabela para PDF", () => {
  const rows = buildReportRows(
    filterFoodsByValidityRange(foods, {
      mode: "days",
      startDate: "2026-08-10",
      endDate: "2026-09-02"
    })
  );

  assert.deepEqual(rows, [
    ["A1", "Arroz", 5, "10/08/2026"],
    ["B2", "Feijão", 3, "20/08/2026"],
    ["C3", "Leite", 4, "02/09/2026"]
  ]);
});
