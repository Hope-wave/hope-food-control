function parseDateOnly(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getFoodStatus(validityDate) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const validity = parseDateOnly(validityDate);
  if (!validity) {
    return "normal";
  }

  const diffMs = validity.getTime() - now.getTime();
  const daysToExpire = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysToExpire < 0) {
    return "vencido";
  }
  if (daysToExpire <= 30) {
    return "proximo";
  }
  return "normal";
}

function getDaysToExpire(validityDate) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const validity = parseDateOnly(validityDate);

  if (!validity) {
    return null;
  }

  const diffMs = validity.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function generateShortId(letterCount = 1, digitCount = 1) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let letterPart = "";
  let digitPart = "";

  for (let i = 0; i < letterCount; i += 1) {
    letterPart += letters.charAt(Math.floor(Math.random() * letters.length));
  }

  for (let i = 0; i < digitCount; i += 1) {
    digitPart += String(Math.floor(Math.random() * 10));
  }

  return `${letterPart}${digitPart}`;
}

/**
 * Item ainda no estoque para listagens, cestas e baixas:
 * quantidade > 0 e não marcado como indisponível (saída total / entregue).
 */
function hasStock(food) {
  if (!food || food.available === false) {
    return false;
  }
  const q = Number(food.quantity);
  return !Number.isNaN(q) && q > 0;
}

async function createUniqueFoodId(db) {
  const digitCount = 1;

  for (let letterCount = 1; letterCount <= 6; letterCount += 1) {
    const stageSpace = 26 ** letterCount * 10 ** digitCount;
    const tried = new Set();

    while (tried.size < stageSpace) {
      const candidate = generateShortId(letterCount, digitCount);
      if (tried.has(candidate)) {
        continue;
      }
      tried.add(candidate);

      // eslint-disable-next-line no-await-in-loop
      const existing = await db.collection("foods").doc(candidate).get();
      if (!existing.exists) {
        return candidate;
      }
    }
  }

  throw new Error(
    "Nao foi possivel gerar um novo ID simples para etiqueta."
  );
}

module.exports = {
  parseDateOnly,
  getFoodStatus,
  getDaysToExpire,
  hasStock,
  createUniqueFoodId
};
