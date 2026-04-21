const { parseDateOnly, hasStock } = require("./inventory");

function stripAccents(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeForMatch(value) {
  return stripAccents(String(value).toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function paddedName(name) {
  return ` ${normalizeForMatch(name)} `;
}

function includesPhrase(name, phrase) {
  return paddedName(name).includes(` ${normalizeForMatch(phrase)} `);
}

function matchesAnyPhrase(name, phrases) {
  return phrases.some((phrase) => includesPhrase(name, phrase));
}

/** Itens obrigatórios da cesta básica (reconhecidos pelo nome cadastrado). */
const BASE_RULES = [
  { key: "arroz", label: "Arroz", phrases: ["arroz"] },
  { key: "feijao", label: "Feijão", phrases: ["feijao", "feijão"] },
  { key: "acucar", label: "Açúcar", phrases: ["acucar", "açúcar"] },
  {
    key: "sal",
    label: "Sal",
    phrases: ["sal"],
    excludeIfIncludes: ["salgado", "salgada", "salgados", "salgadas"]
  },
  { key: "oleo", label: "Óleo", phrases: ["oleo", "óleo"] },
  { key: "macarrao", label: "Macarrão", phrases: ["macarrao", "macarrão"] },
  { key: "molho", label: "Molho", phrases: ["molho"] }
];

/** Adicionais: entram se houver estoque; ausência não impede a cesta. */
const OPTIONAL_RULES = [
  {
    key: "farinha",
    label: "Farinha (trigo ou mandioca)",
    phrases: ["farinha", "fuba", "polvilho", "mandioca"]
  },
  {
    key: "leite",
    label: "Leite (líquido ou em pó)",
    phrases: ["leite"]
  },
  {
    key: "achocolatado",
    label: "Achocolatado",
    phrases: ["achocolatado", "toddy", "nescau"]
  },
  { key: "cafe", label: "Café", phrases: ["cafe", "café"] },
  {
    key: "enlatado",
    label: "Enlatado (milho, ervilha, seleta, atum, sardinha, etc.)",
    phrases: [
      "milho verde",
      "conserva de milho",
      "milho em conserva",
      "ervilha",
      "seleta",
      "atum",
      "sardinha",
      "enlatado",
      "conserva",
      "seleta de legumes"
    ]
  },
  {
    key: "bolacha",
    label: "Bolacha / biscoito",
    phrases: ["bolacha", "biscoito", "cream cracker", "maizena"]
  }
];

function matchesBaseRule(rule, name) {
  const padded = paddedName(name);
  const normalized = normalizeForMatch(name);

  if (rule.excludeIfIncludes) {
    const blocked = rule.excludeIfIncludes.some((fragment) =>
      normalized.includes(normalizeForMatch(fragment))
    );
    if (blocked) {
      return false;
    }
  }

  return rule.phrases.some((phrase) => padded.includes(` ${normalizeForMatch(phrase)} `));
}

function matchesOptionalRule(rule, name) {
  return matchesAnyPhrase(name, rule.phrases);
}

function sortByFefoThenId(a, b) {
  const ta = parseDateOnly(a.validityDate);
  const tb = parseDateOnly(b.validityDate);
  const da = ta ? ta.getTime() : Number.POSITIVE_INFINITY;
  const db = tb ? tb.getTime() : Number.POSITIVE_INFINITY;
  if (da !== db) {
    return da - db;
  }
  return String(a.id).localeCompare(String(b.id));
}

function pickOneUnitFromCandidates(candidates, workingQtyById) {
  const inStock = candidates.filter((f) => (workingQtyById.get(f.id) || 0) > 0);
  if (!inStock.length) {
    return null;
  }
  inStock.sort(sortByFefoThenId);
  const chosen = inStock[0];
  const before = workingQtyById.get(chosen.id) || 0;
  workingQtyById.set(chosen.id, before - 1);
  return {
    foodId: chosen.id,
    foodName: chosen.name,
    validityDate: chosen.validityDate,
    quantityOut: 1,
    quantityBefore: before
  };
}

function planBasicBasket(foods) {
  const list = foods.filter(hasStock).map((f) => ({
    ...f,
    quantity: Number(f.quantity)
  }));

  const workingQtyById = new Map(list.map((f) => [f.id, f.quantity]));

  const baseAllocations = [];
  const missingBase = [];

  for (const rule of BASE_RULES) {
    const candidates = list.filter(
      (f) => (workingQtyById.get(f.id) || 0) > 0 && matchesBaseRule(rule, f.name)
    );
    const pick = pickOneUnitFromCandidates(candidates, workingQtyById);
    if (!pick) {
      missingBase.push({ key: rule.key, label: rule.label });
    } else {
      baseAllocations.push({
        ...pick,
        categoryKey: rule.key,
        categoryLabel: rule.label
      });
    }
  }

  const optionalIncluded = [];
  const optionalSkipped = [];

  for (const rule of OPTIONAL_RULES) {
    const candidates = list.filter(
      (f) => (workingQtyById.get(f.id) || 0) > 0 && matchesOptionalRule(rule, f.name)
    );
    const pick = pickOneUnitFromCandidates(candidates, workingQtyById);
    if (!pick) {
      optionalSkipped.push({
        key: rule.key,
        label: rule.label,
        reason: "Sem estoque compatível no momento."
      });
    } else {
      optionalIncluded.push({
        ...pick,
        categoryKey: rule.key,
        categoryLabel: rule.label
      });
    }
  }

  const allocations = [...baseAllocations, ...optionalIncluded];
  const canAssemble = missingBase.length === 0;

  return {
    canAssemble,
    missingBase,
    baseItems: baseAllocations,
    optionalIncluded,
    optionalSkipped,
    allocations
  };
}

/**
 * Lista única para o voluntário montar a cesta: ordem por validade (FEFO),
 * depois ID. Cada linha traz o ID da etiqueta a separar no estoque.
 */
function buildPickListForVolunteer(plan, getDaysToExpire) {
  const merged = [...plan.baseItems, ...plan.optionalIncluded];
  merged.sort((a, b) => {
    const va = a.validityDate || "";
    const vb = b.validityDate || "";
    const byDate = va.localeCompare(vb);
    if (byDate !== 0) {
      return byDate;
    }
    return String(a.foodId).localeCompare(String(b.foodId));
  });

  return merged.map((item, index) => {
    const isBase = plan.baseItems.some(
      (b) => b.foodId === item.foodId && b.categoryKey === item.categoryKey
    );
    return {
      order: index + 1,
      kind: isBase ? "base" : "adicional",
      categoryKey: item.categoryKey,
      categoryLabel: item.categoryLabel,
      foodId: item.foodId,
      foodName: item.foodName,
      validityDate: item.validityDate,
      quantityOut: item.quantityOut,
      daysToExpire: getDaysToExpire(item.validityDate)
    };
  });
}

module.exports = {
  BASE_RULES,
  OPTIONAL_RULES,
  planBasicBasket,
  buildPickListForVolunteer
};
