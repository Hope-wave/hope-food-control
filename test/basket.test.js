const test = require("node:test");
const assert = require("node:assert/strict");

const {
  planBasicBasket,
  buildPickListForVolunteer,
  parseFoodIds
} = require("../src/basket");
const { summarizeEntryCategories } = require("../src/dashboard");

function food(id, name, validityDate, quantity = 1, available = true) {
  return { id, name, validityDate, quantity, available };
}

test("monta uma cesta completa com uma unidade por item e gera a lista em ordem de validade", () => {
  const foods = [
    food("AR-1", "Arroz", "2026-08-10"),
    food("FE-1", "Feijão", "2026-08-11"),
    food("AC-1", "Açúcar", "2026-08-12"),
    food("SA-1", "Sal", "2026-08-13"),
    food("OL-1", "Óleo", "2026-08-14"),
    food("MA-1", "Macarrão", "2026-08-15"),
    food("MO-1", "Molho de tomate", "2026-08-16"),
    food("LE-1", "Leite em pó", "2026-08-17"),
    food("CA-1", "Café", "2026-08-18")
  ];

  const plan = planBasicBasket(foods);
  const pickList = buildPickListForVolunteer(plan, () => 10);

  assert.equal(plan.canAssemble, true);
  assert.equal(plan.hasAllBaseItems, true);
  assert.equal(plan.missingBase.length, 0);
  assert.equal(plan.baseItems.length, 7);
  assert.equal(plan.optionalIncluded.length, 2);
  assert.equal(plan.allocations.length, 9);
  assert.ok(plan.allocations.every((item) => item.quantityOut === 1));
  assert.deepEqual(
    pickList.map((item) => item.foodId),
    ["AR-1", "FE-1", "AC-1", "SA-1", "OL-1", "MA-1", "MO-1", "LE-1", "CA-1"]
  );
  assert.equal(foods.find((item) => item.id === "AR-1").quantity, 1);
});

test("permite a saída parcial quando houver alimentos disponíveis e informa os itens-base faltantes", () => {
  const plan = planBasicBasket([
    food("AR-1", "Arroz", "2026-08-10"),
    food("FE-1", "Feijão", "2026-08-11", 1, false),
    food("AC-1", "Açúcar", "2026-08-12", 0)
  ]);

  assert.equal(plan.canAssemble, true);
  assert.equal(plan.hasAllBaseItems, false);
  assert.deepEqual(plan.allocations.map((item) => item.foodId), ["AR-1"]);
  assert.deepEqual(
    plan.missingBase.map((item) => item.key),
    ["feijao", "acucar", "sal", "oleo", "macarrao", "molho"]
  );
});

test("sugere outra unidade do mesmo alimento quando o voluntário retira um ID da cesta", () => {
  const foods = [
    food("A1", "Arroz", "2026-08-10"),
    food("A2", "Arroz tipo 1", "2026-08-20"),
    food("A3", "Arroz", "2026-09-01"),
    food("F1", "Feijão", "2026-08-11")
  ];

  const first = planBasicBasket(foods);
  assert.deepEqual(first.baseItems.map((item) => item.foodId), ["A1", "F1"]);
  assert.deepEqual(first.excludedItems, []);

  const plan = planBasicBasket(foods, { excludedIds: ["a1"] });
  const pickList = buildPickListForVolunteer(plan, () => 10);
  const arroz = pickList.find((item) => item.categoryKey === "arroz");

  assert.equal(arroz.foodId, "A2");
  assert.deepEqual(arroz.replacesIds, ["A1"]);
  assert.deepEqual(pickList.find((item) => item.foodId === "F1").replacesIds, []);
  assert.deepEqual(plan.excludedItems, [
    { foodId: "A1", foodName: "Arroz", categoryKey: "arroz", categoryLabel: "Arroz" }
  ]);
  assert.equal(foods.find((item) => item.id === "A1").quantity, 1);

  const next = planBasicBasket(foods, { excludedIds: ["A1", "A2"] });
  assert.equal(next.baseItems.find((item) => item.categoryKey === "arroz").foodId, "A3");
});

test("marca o item como faltante quando não há outra unidade do mesmo alimento", () => {
  const plan = planBasicBasket(
    [food("A1", "Arroz", "2026-08-10"), food("F1", "Feijão", "2026-08-11")],
    { excludedIds: ["A1"] }
  );

  assert.deepEqual(plan.allocations.map((item) => item.foodId), ["F1"]);
  assert.ok(plan.missingBase.some((item) => item.key === "arroz"));
  assert.deepEqual(plan.excludedItems.map((item) => item.foodId), ["A1"]);
});

test("normaliza a lista de IDs recebida da tela", () => {
  assert.deepEqual(parseFoodIds(" a1, B2 ,,a1"), ["A1", "B2"]);
  assert.deepEqual(parseFoodIds(["c3", "C3", ""]), ["C3"]);
  assert.deepEqual(parseFoodIds(undefined), []);
});

test("bloqueia a saída da cesta quando não há nenhum alimento disponível", () => {
  const plan = planBasicBasket([
    food("AR-1", "Arroz", "2026-08-10", 0),
    food("FE-1", "Feijão", "2026-08-11", 1, false)
  ]);

  assert.equal(plan.canAssemble, false);
  assert.equal(plan.allocations.length, 0);
  assert.equal(plan.missingBase.length, 7);
});

test("agrupa as categorias que entraram no mês pela quantidade originalmente recebida", () => {
  const categories = summarizeEntryCategories(
    [
      { name: "Arroz", quantity: 2, quantityIn: 5, createdAt: "2026-07-02" },
      { name: "Feijão", quantity: 3, createdAt: "2026-07-15" },
      { name: "Leite", quantity: 4, createdAt: "2026-06-30" }
    ],
    "2026-07",
    (date) => date.slice(0, 7),
    (name) => ({
      Arroz: { key: "arroz", label: "Arroz" },
      Feijão: { key: "feijao", label: "Feijão" },
      Leite: { key: "leite", label: "Leite" }
    })[name],
    Number
  );

  assert.deepEqual(categories, [
    { label: "Arroz", quantity: 5 },
    { label: "Feijão", quantity: 3 }
  ]);
});
