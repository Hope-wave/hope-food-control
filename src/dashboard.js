function summarizeEntryCategories(
  foods,
  selectedMonth,
  getMonthKey,
  getFoodCategory,
  quantityOf
) {
  const categories = new Map();

  foods.forEach((food) => {
    if (getMonthKey(food.createdAt) !== selectedMonth) {
      return;
    }

    const name = String(food.name || "Alimento sem nome").trim() || "Alimento sem nome";
    const category = getFoodCategory(name);
    const summary = categories.get(category.key) || {
      label: category.label,
      quantity: 0
    };
    summary.quantity += quantityOf(food.quantityIn ?? food.quantity);
    categories.set(category.key, summary);
  });

  return [...categories.values()].sort(
    (a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label, "pt-BR")
  );
}

module.exports = { summarizeEntryCategories };
