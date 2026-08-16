function getAvailableMonths(foods = []) {
  const months = new Set(
    foods
      .filter((food) => food && food.validityDate)
      .map((food) => String(food.validityDate).slice(0, 7))
      .filter(Boolean)
  );

  return [...months].sort();
}

function clampDate(value, fallback) {
  if (!value) return fallback;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date;
}

function inRange(dateValue, start, end) {
  const current = clampDate(dateValue, null);
  if (!current) return false;
  return current >= start && current <= end;
}

function getMonthRangeEnd(monthKey) {
  const [year, month] = String(monthKey || "").split("-");
  if (!year || !month) {
    return null;
  }

  const yearNumber = Number(year);
  const monthNumber = Number(month);
  if (!Number.isInteger(yearNumber) || !Number.isInteger(monthNumber)) {
    return null;
  }

  const lastDay = new Date(yearNumber, monthNumber, 0).getDate();
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}T23:59:59`);
}

function filterFoodsByValidityRange(foods = [], filter = {}) {
  const safeFoods = Array.isArray(foods) ? foods : [];

  const mode = filter.mode === "months" ? "months" : "days";

  if (mode === "months") {
    const startMonth = filter.startMonth || "";
    const endMonth = filter.endMonth || startMonth;
    if (!startMonth || !endMonth) {
      return safeFoods.filter((food) => food && food.validityDate);
    }

    const start = new Date(`${startMonth}-01T00:00:00`);
    const end = getMonthRangeEnd(endMonth);
    if (!end) {
      return safeFoods.filter((food) => food && food.validityDate);
    }

    return safeFoods.filter((food) => {
      const validityDate = String(food?.validityDate || "");
      if (!validityDate) return false;
      const date = new Date(`${validityDate}T00:00:00`);
      return !Number.isNaN(date.getTime()) && date >= start && date <= end;
    });
  }

  const startDate = clampDate(filter.startDate || "", null);
  const endDate = clampDate(filter.endDate || "", null);

  if (!startDate || !endDate) {
    return safeFoods.filter((food) => food && food.validityDate);
  }

  return safeFoods.filter((food) => {
    const validityDate = String(food?.validityDate || "");
    return !!validityDate && inRange(validityDate, startDate, endDate);
  });
}

function formatDatePtBr(dateIso) {
  if (!dateIso) return "—";
  const match = String(dateIso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(dateIso);
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function buildReportRows(foods = []) {
  return foods
    .filter((food) => food && food.validityDate)
    .sort((a, b) => String(a.validityDate).localeCompare(String(b.validityDate)))
    .map((food) => [
      String(food.id || "—"),
      String(food.name || "Alimento sem nome"),
      Number(food.quantity ?? 0),
      formatDatePtBr(food.validityDate)
    ]);
}

module.exports = {
  getAvailableMonths,
  filterFoodsByValidityRange,
  buildReportRows
};
