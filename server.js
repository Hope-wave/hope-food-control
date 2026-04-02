require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");

const { initFirebase } = require("./src/firebase");
const { authenticate, requireAuth, requireRole } = require("./src/auth");
const {
  getFoodStatus,
  getDaysToExpire,
  createUniqueFoodId
} = require("./src/inventory");

const app = express();
const db = initFirebase();

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

app.use(express.static(path.join(__dirname, "public")));

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
    const { name, quantity, weight, validityDate } = req.body;

    if (!name || !quantity || !weight || !validityDate) {
      return res.status(400).json({ message: "Preencha todos os campos." });
    }

    const parsedQuantity = Number(quantity);
    const parsedWeight = Number(weight);
    if (
      Number.isNaN(parsedQuantity) ||
      parsedQuantity <= 0 ||
      Number.isNaN(parsedWeight) ||
      parsedWeight <= 0
    ) {
      return res
        .status(400)
        .json({ message: "Quantidade e peso devem ser maiores que zero." });
    }

    const shortId = await createUniqueFoodId(db);
    const payload = {
      id: shortId,
      name: String(name).trim(),
      quantity: parsedQuantity,
      weight: parsedWeight,
      validityDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.session.user.username
    };

    await db.collection("foods").doc(shortId).set(payload);
    return res.status(201).json(payload);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/api/foods/output", requireRole("volunteer"), async (req, res) => {
  try {
    const { id, quantityOut } = req.body;

    if (!id || !quantityOut) {
      return res
        .status(400)
        .json({ message: "Informe ID e quantidade de saída." });
    }

    const foodRef = db.collection("foods").doc(String(id).trim().toUpperCase());
    const snapshot = await foodRef.get();

    if (!snapshot.exists) {
      return res.status(404).json({ message: "Alimento não encontrado." });
    }

    const food = snapshot.data();
    const outputQty = Number(quantityOut);

    if (outputQty <= 0) {
      return res
        .status(400)
        .json({ message: "Quantidade de saída deve ser maior que zero." });
    }

    if (outputQty > food.quantity) {
      return res.status(400).json({
        message: "Quantidade de saída maior que o estoque atual."
      });
    }

    const updatedQty = food.quantity - outputQty;

    await foodRef.update({
      quantity: updatedQty,
      updatedAt: new Date().toISOString()
    });

    await db.collection("outputs").add({
      foodId: food.id,
      foodName: food.name,
      quantityOut: outputQty,
      registeredBy: req.session.user.username,
      createdAt: new Date().toISOString()
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

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Hope Food Control rodando em http://localhost:${port}`);
});
