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
const { planBasicBasket, buildPickListForVolunteer } = require("./src/basket");

const app = express();
const db = initFirebase();

const port = Number(process.env.PORT) || 3000;

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
app.use(
  session({
    name: "hope.sid",
    secret: process.env.SESSION_SECRET || "hope-secret-dev",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    }
  })
);

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

app.post("/api/foods", requireRole("volunteer"), async (req, res) => {
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
      const foodRef = db.collection("foods").doc(shortId);
      const payload = {
        id: shortId,
        name: nameTrimmed,
        quantity: 1,
        weight: parsedWeight,
        validityDate: validityTrimmed,
        available: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: req.session.user.username
      };

      try {
        // Transacao evita sobrescrever em corrida simultanea mesmo sem docRef.create().
        // eslint-disable-next-line no-await-in-loop
        await db.runTransaction(async (tx) => {
          const existing = await tx.get(foodRef);
          if (existing.exists) {
            const err = new Error("duplicate-id");
            err.code = "duplicate-id";
            throw err;
          }
          tx.set(foodRef, payload);
        });
        return res.status(201).json(payload);
      } catch (error) {
        const alreadyExists =
          error?.code === "duplicate-id" ||
          error?.code === 6 ||
          error?.code === "already-exists";
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

app.post("/api/foods/output", requireRole("volunteer"), async (req, res) => {
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

    await foodRef.update({
      quantity: updatedQty,
      available: updatedQty > 0,
      updatedAt: new Date().toISOString()
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
          message:
            "Não é possível montar a cesta: faltam itens obrigatórios no estoque.",
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
        registeredBy: req.session.user.username,
        createdAt: new Date().toISOString()
      });

      return res.json({
        message: "Saída da cesta básica registrada com sucesso.",
        lines
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
