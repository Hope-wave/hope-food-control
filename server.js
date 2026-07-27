require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");

const { initFirebase } = require("./src/firebase");
const { authenticate, requireAuth, requireRole, requireRoles } = require("./src/auth");
const {
  getFoodStatus,
  getDaysToExpire,
  hasStock,
  createUniqueFoodId
} = require("./src/inventory");
const {
  planBasicBasket,
  buildPickListForVolunteer,
  getFoodCategory
} = require("./src/basket");
const { summarizeEntryCategories } = require("./src/dashboard");

const app = express();
const { db, useFirestoreSessionStore } = initFirebase();

const isProduction = process.env.NODE_ENV === "production";
if (process.env.VERCEL || isProduction) {
  app.set("trust proxy", 1);
}

function sessionCookieSecure() {
  if (process.env.SESSION_COOKIE_SECURE === "true") {
    return true;
  }
  if (process.env.SESSION_COOKIE_SECURE === "false") {
    return false;
  }
  return Boolean(process.env.VERCEL);
}

const port = Number(process.env.PORT) || 3000;
const DASHBOARD_TIME_ZONE = "America/Sao_Paulo";

function monthKeyInDashboardTimeZone(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DASHBOARD_TIME_ZONE,
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${values.year}-${values.month}`;
}

function isMonthKey(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ""));
}

function getDashboardMonth(requestedMonth) {
  const currentKey = monthKeyInDashboardTimeZone(new Date());
  const key = isMonthKey(requestedMonth) ? requestedMonth : currentKey;
  const referenceDate = new Date(`${key}-01T12:00:00-03:00`);
  return {
    key,
    label: new Intl.DateTimeFormat("pt-BR", {
      timeZone: DASHBOARD_TIME_ZONE,
      month: "long",
      year: "numeric"
    }).format(referenceDate),
    shortLabel: new Intl.DateTimeFormat("pt-BR", {
      timeZone: DASHBOARD_TIME_ZONE,
      month: "short",
      year: "2-digit"
    })
      .format(referenceDate)
      .replace(".", "")
  };
}

function quantityOf(value) {
  const quantity = Number(value?.quantity ?? value);
  return Number.isNaN(quantity) ? 0 : quantity;
}

function sumBasketLineQuantities(basket) {
  return Array.isArray(basket?.lines)
    ? basket.lines.reduce((total, line) => total + quantityOf(line.quantityOut), 0)
    : 0;
}

function devCors(req, res, next) {
  if (process.env.NODE_ENV === "production") {
    return next();
  }
  const origin = req.headers.origin;
  const allowed = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5501",
    "http://127.0.0.1:5501",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`
  ]);
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  return next();
}

app.use(devCors);

app.use(express.json());

function createSessionMiddleware() {
  const sessionOptions = {
    name: "hope.sid",
    secret: process.env.SESSION_SECRET || "hope-secret-dev",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: sessionCookieSecure()
    }
  };

  if (useFirestoreSessionStore) {
    const FirestoreStore = require("firestore-store")(session);
    return session({
      ...sessionOptions,
      store: new FirestoreStore({
        database: db,
        collection: "hope_sessions"
      })
    });
  }

  if (isProduction) {
    // eslint-disable-next-line no-console
    console.warn(
      "Sessoes em memoria nao persistem na Vercel (varias instancias). Configure FIREBASE_SERVICE_ACCOUNT_JSON no painel."
    );
  }

  return session(sessionOptions);
}

app.use(createSessionMiddleware());

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = authenticate(username, password);

  if (!user) {
    return res.status(401).json({ message: "Usuário ou senha inválidos." });
  }

  req.session.user = user;
  return res.json({ user });
});

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("hope.sid");
    res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) {
    return res.json({ user: null });
  }
  return res.json({ user: req.session.user });
});

app.post("/api/foods", requireRoles("volunteer", "admin"), async (req, res) => {
  try {
    const { name, weight, validityDate } = req.body;

    const nameTrimmed = String(name || "").trim();
    if (!nameTrimmed) {
      return res.status(400).json({ message: "Informe o nome do alimento." });
    }

    const validityTrimmed =
      validityDate === undefined || validityDate === null
        ? ""
        : String(validityDate).trim();
    if (!validityTrimmed) {
      return res.status(400).json({ message: "Informe a data de validade." });
    }

    let parsedWeight = null;
    const weightStr =
      weight === undefined || weight === null || weight === ""
        ? ""
        : String(weight).trim();
    if (weightStr !== "") {
      parsedWeight = Number(weightStr);
      if (Number.isNaN(parsedWeight) || parsedWeight <= 0) {
        return res.status(400).json({
          message: "Se informar peso, use um valor maior que zero (kg)."
        });
      }
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      const shortId = await createUniqueFoodId(db);
      const payload = {
        id: shortId,
        name: nameTrimmed,
        quantity: 1,
        quantityIn: 1,
        weight: parsedWeight,
        validityDate: validityTrimmed,
        available: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: req.session.user.username
      };

      try {
        // "create" falha se o doc ja existir: evita sobrescrever em corrida simultanea.
        // eslint-disable-next-line no-await-in-loop
        await db.collection("foods").doc(shortId).create(payload);
        return res.status(201).json(payload);
      } catch (error) {
        const alreadyExists =
          error?.code === 6 ||
          error?.code === "already-exists" ||
          String(error?.message || "").toLowerCase().includes("already exists");
        if (!alreadyExists) {
          throw error;
        }
      }
    }

    return res.status(503).json({
      message: "Nao foi possivel gerar um ID unico no momento. Tente novamente."
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/foods/output", requireRoles("volunteer", "admin"), async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Informe o ID do alimento." });
    }

    const foodRef = db.collection("foods").doc(String(id).trim().toUpperCase());
    const snapshot = await foodRef.get();

    if (!snapshot.exists) {
      return res.status(404).json({ message: "Alimento não encontrado." });
    }

    const food = snapshot.data();

    if (food.available === false) {
      return res.status(400).json({
        message: "Este item não está mais disponível no estoque."
      });
    }

    const outputQty = 1;

    if (outputQty > food.quantity) {
      return res.status(400).json({
        message: "Quantidade de saída maior que o estoque atual."
      });
    }

    const updatedQty = food.quantity - outputQty;
    const createdAt = new Date().toISOString();

    await foodRef.update({
      quantity: updatedQty,
      available: updatedQty > 0,
      updatedAt: createdAt
    });

    await db.collection("foodOutputs").add({
      type: "saida_avulsa",
      foodId: food.id,
      foodName: food.name,
      quantityOut: outputQty,
      registeredBy: req.session.user.username,
      createdAt
    });

    return res.json({
      message: "Saída registrada com sucesso.",
      foodId: food.id,
      quantityRemaining: updatedQty
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/admin/foods", requireRole("admin"), async (req, res) => {
  try {
    const snapshot = await db.collection("foods").get();
    const foods = snapshot.docs
      .map((doc) => doc.data())
      .filter(hasStock)
      .map((food) => ({
        ...food,
        status: getFoodStatus(food.validityDate),
        daysToExpire: getDaysToExpire(food.validityDate)
      }))
      .sort((a, b) => a.validityDate.localeCompare(b.validityDate));

    return res.json({ foods });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/admin/alerts", requireRole("admin"), async (req, res) => {
  try {
    const snapshot = await db.collection("foods").get();
    const alerts = snapshot.docs
      .map((doc) => doc.data())
      .filter(hasStock)
      .map((food) => ({
        ...food,
        status: getFoodStatus(food.validityDate),
        daysToExpire: getDaysToExpire(food.validityDate)
      }))
      .filter(
        (food) =>
          food.daysToExpire !== null &&
          food.daysToExpire >= 0 &&
          food.daysToExpire <= 30
      )
      .sort((a, b) => a.daysToExpire - b.daysToExpire);

    return res.json({ alerts });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get("/api/admin/dashboard", requireRole("admin"), async (req, res) => {
  try {
    const [foodsSnapshot, foodOutputsSnapshot, basketOutputsSnapshot] =
      await Promise.all([
        db.collection("foods").get(),
        db.collection("foodOutputs").get(),
        db.collection("basketOutputs").get()
      ]);

    const foods = foodsSnapshot.docs.map((doc) => doc.data());
    const foodOutputs = foodOutputsSnapshot.docs.map((doc) => doc.data());
    const basketOutputs = basketOutputsSnapshot.docs.map((doc) => doc.data());
    const month = getDashboardMonth(req.query.month);
    const currentMonth = getDashboardMonth();
    const monthKeys = new Set([currentMonth.key]);
    const entriesByMonth = new Map();
    const individualOutputsByMonth = new Map();
    const basketOutputsByMonth = new Map();
    const basketsByMonth = new Map();
    const addToMonth = (map, key, value) => {
      if (!key) return;
      monthKeys.add(key);
      map.set(key, (map.get(key) || 0) + value);
    };

    foods.forEach((food) => {
      addToMonth(
        entriesByMonth,
        monthKeyInDashboardTimeZone(food.createdAt),
        quantityOf(food.quantityIn ?? food.quantity)
      );
    });
    foodOutputs.forEach((output) => {
      addToMonth(
        individualOutputsByMonth,
        monthKeyInDashboardTimeZone(output.createdAt),
        quantityOf(output.quantityOut)
      );
    });
    basketOutputs.forEach((basket) => {
      const key = monthKeyInDashboardTimeZone(basket.createdAt);
      addToMonth(basketsByMonth, key, 1);
      addToMonth(basketOutputsByMonth, key, sumBasketLineQuantities(basket));
    });

    const entriesThisMonth = entriesByMonth.get(month.key) || 0;
    const entryCategories = summarizeEntryCategories(
      foods,
      month.key,
      monthKeyInDashboardTimeZone,
      getFoodCategory,
      quantityOf
    );
    const individualOutputs = individualOutputsByMonth.get(month.key) || 0;
    const basketFoodOutputs = basketOutputsByMonth.get(month.key) || 0;
    const basketsThisMonth = basketsByMonth.get(month.key) || 0;
    const foodsInStock = foods.filter(hasStock);
    const stockUnits = foodsInStock.reduce(
      (total, food) => total + quantityOf(food),
      0
    );
    const foodTypesInStock = new Set(
      foodsInStock.map((food) => String(food.name || "").trim().toLowerCase())
    ).size;
    const expiringSoon = foodsInStock.filter((food) => {
      const days = getDaysToExpire(food.validityDate);
      return days !== null && days >= 0 && days <= 30;
    }).length;
    const expired = foodsInStock.filter(
      (food) => getFoodStatus(food.validityDate) === "vencido"
    ).length;
    const stockByFood = new Map();
    const stockByCategory = new Map();

    foodsInStock.forEach((food) => {
      const name = String(food.name || "Alimento sem nome").trim() || "Alimento sem nome";
      const foodKey = name.toLocaleLowerCase("pt-BR");
      const foodSummary = stockByFood.get(foodKey) || { name, quantity: 0 };
      foodSummary.quantity += quantityOf(food);
      stockByFood.set(foodKey, foodSummary);

      const category = getFoodCategory(name);
      const categorySummary = stockByCategory.get(category.key) || {
        label: category.label,
        quantity: 0
      };
      categorySummary.quantity += quantityOf(food);
      stockByCategory.set(category.key, categorySummary);
    });
    const sortByQuantity = (a, b) =>
      b.quantity - a.quantity || a.name.localeCompare(b.name, "pt-BR");
    const availableMonths = [...monthKeys]
      .sort((a, b) => b.localeCompare(a))
      .map((key) => getDashboardMonth(key));
    const history = [...monthKeys]
      .sort((a, b) => a.localeCompare(b))
      .slice(-12)
      .map((key) => ({
        key,
        label: getDashboardMonth(key).shortLabel,
        entries: entriesByMonth.get(key) || 0,
        foodOutputs:
          (individualOutputsByMonth.get(key) || 0) +
          (basketOutputsByMonth.get(key) || 0),
        baskets: basketsByMonth.get(key) || 0
      }));

    return res.json({
      month,
      months: availableMonths.map(({ key, label }) => ({ key, label })),
      history,
      entryCategories,
      stockByFood: [...stockByFood.values()].sort(sortByQuantity),
      stockByCategory: [...stockByCategory.values()].sort(
        (a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label)
      ),
      metrics: {
        entries: entriesThisMonth,
        foodOutputs: individualOutputs + basketFoodOutputs,
        baskets: basketsThisMonth,
        stockUnits,
        foodTypesInStock,
        expiringSoon,
        expired,
        individualOutputs,
        basketFoodOutputs,
        averageItemsPerBasket: basketsThisMonth
          ? Number((basketFoodOutputs / basketsThisMonth).toFixed(1))
          : 0
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.get(
  "/api/baskets/basic/plan",
  requireRoles("volunteer", "admin"),
  async (req, res) => {
    try {
      const snapshot = await db.collection("foods").get();
      const foods = snapshot.docs.map((doc) => doc.data());
      const plan = planBasicBasket(foods);
      const pickList = buildPickListForVolunteer(plan, getDaysToExpire);

      return res.json({
        canAssemble: plan.canAssemble,
        hasAllBaseItems: plan.hasAllBaseItems,
        missingBase: plan.missingBase,
        pickList,
        baseItems: plan.baseItems.map((item) => ({
          categoryKey: item.categoryKey,
          categoryLabel: item.categoryLabel,
          foodId: item.foodId,
          foodName: item.foodName,
          validityDate: item.validityDate,
          quantityOut: item.quantityOut,
          daysToExpire: getDaysToExpire(item.validityDate)
        })),
        optionalIncluded: plan.optionalIncluded.map((item) => ({
          categoryKey: item.categoryKey,
          categoryLabel: item.categoryLabel,
          foodId: item.foodId,
          foodName: item.foodName,
          validityDate: item.validityDate,
          quantityOut: item.quantityOut,
          daysToExpire: getDaysToExpire(item.validityDate)
        })),
        optionalSkipped: plan.optionalSkipped,
        summary: {
          baseCount: plan.baseItems.length,
          optionalCount: plan.optionalIncluded.length,
          totalLines: plan.allocations.length
        }
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);

app.post(
  "/api/baskets/basic/checkout",
  requireRoles("volunteer", "admin"),
  async (req, res) => {
    try {
      const notes = req.body?.notes
        ? String(req.body.notes).trim().slice(0, 500)
        : "";

      const snapshot = await db.collection("foods").get();
      const foods = snapshot.docs.map((doc) => doc.data());
      const plan = planBasicBasket(foods);

      if (!plan.canAssemble) {
        return res.status(400).json({
          message: "Não há alimentos disponíveis para registrar a saída da cesta.",
          missingBase: plan.missingBase
        });
      }

      const lines = [];

      for (const item of plan.allocations) {
        const foodRef = db.collection("foods").doc(String(item.foodId).trim());
        const snap = await foodRef.get();

        if (!snap.exists) {
          return res.status(409).json({
            message:
              "O estoque mudou enquanto a montagem era calculada. Atualize e tente novamente.",
            foodId: item.foodId
          });
        }

        const food = snap.data();
        const currentQty = Number(food.quantity);

        if (Number.isNaN(currentQty) || currentQty < item.quantityOut) {
          return res.status(409).json({
            message:
              "O estoque mudou enquanto a montagem era calculada. Atualize e tente novamente.",
            foodId: item.foodId
          });
        }

        const updatedQty = currentQty - item.quantityOut;

        await foodRef.update({
          quantity: updatedQty,
          available: updatedQty > 0,
          updatedAt: new Date().toISOString()
        });

        lines.push({
          foodId: food.id,
          foodName: food.name,
          categoryKey: item.categoryKey,
          categoryLabel: item.categoryLabel,
          quantityOut: item.quantityOut,
          validityDate: food.validityDate,
          quantityRemaining: updatedQty
        });
      }

      await db.collection("basketOutputs").add({
        type: "cesta_basica",
        notes,
        lines,
        missingBase: plan.missingBase,
        registeredBy: req.session.user.username,
        createdAt: new Date().toISOString()
      });

      return res.json({
        message: "Saída da cesta básica registrada com sucesso.",
        lines,
        missingBase: plan.missingBase
      });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
);

const publicDir = path.join(__dirname, "public");
const indexHtmlPath = path.join(publicDir, "index.html");

function sendAppHtml(req, res) {
  try {
    const html = fs.readFileSync(indexHtmlPath, "utf8");
    const host = req.get("host") || `localhost:${port}`;
    let proto = (req.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      .trim();
    if (!proto) {
      proto = req.protocol || "http";
    }
    const apiOrigin = `${proto}://${host}`.replace(/\/$/, "").replace(/"/g, "");
    const out = html.replace(/__HOPE_API_ORIGIN__/g, apiOrigin);
    return res.type("html").send(out);
  } catch (error) {
    return res.status(500).send(error.message);
  }
}

app.get(["/", "/index.html"], (req, res) => {
  return sendAppHtml(req, res);
});

app.use(express.static(publicDir, { index: false }));

function spaFallback(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ message: "Rota API nao encontrada." });
  }
  if (path.extname(req.path)) {
    return res.status(404).send("Not found");
  }
  return sendAppHtml(req, res);
}

app.use(spaFallback);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Hope Food Control rodando em http://localhost:${port}`);
});
