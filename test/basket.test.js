const test = require("node:test");
const assert = require("node:assert/strict");

const {
  planBasicBasket,
  buildPickListForVolunteer
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
