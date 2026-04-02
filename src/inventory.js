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

function generateShortId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  for (let i = 0; i < 6; i += 1) {
    id += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return id;
}

async function createUniqueFoodId(db) {
  for (let i = 0; i < 25; i += 1) {
    const candidate = generateShortId();
    // eslint-disable-next-line no-await-in-loop
    const existing = await db.collection("foods").doc(candidate).get();
    if (!existing.exists) {
      return candidate;
    }
  }

  throw new Error("Falha ao gerar ID unico.");
}

module.exports = {
  getFoodStatus,
  getDaysToExpire,
  createUniqueFoodId
};
