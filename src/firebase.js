const path = require("path");
const admin = require("firebase-admin");

function normalizeServiceAccount(serviceAccount) {
  if (!serviceAccount || typeof serviceAccount !== "object") {
    throw new Error("Credencial de servico Firebase invalida.");
  }

  const requiredFields = ["project_id", "client_email", "private_key"];
  const missing = requiredFields.filter((field) => !serviceAccount[field]);
  if (missing.length > 0) {
    throw new Error(
      `Credencial incompleta. Campos ausentes: ${missing.join(", ")}.`
    );
  }

  return {
    ...serviceAccount,
    private_key: String(serviceAccount.private_key).replace(/\\n/g, "\n")
  };
}

function createInMemoryDb() {
  const store = {
    foods: new Map()
  };

  return {
    collection(collectionName) {
      if (!store[collectionName]) {
        store[collectionName] = new Map();
      }

      const collectionStore = store[collectionName];

      return {
        doc(id) {
          const key = String(id);
          return {
            async get() {
              const value = collectionStore.get(key);
              return {
                exists: value !== undefined,
                data: () => value
              };
            },
            async set(payload) {
              collectionStore.set(key, payload);
            },
            async update(patch) {
              const current = collectionStore.get(key);
              if (!current) {
                throw new Error("Documento nao encontrado para atualizar.");
              }
              collectionStore.set(key, { ...current, ...patch });
            }
          };
        },
        async add(payload) {
          const randomId = `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;
          collectionStore.set(randomId, payload);
          return { id: randomId };
        },
        async get() {
          const docs = Array.from(collectionStore.values()).map((value) => ({
            data: () => value
          }));
          return { docs };
        }
      };
    }
  };
}

function buildServiceAccount() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();

  if (json) {
    try {
      return normalizeServiceAccount(JSON.parse(json));
    } catch (error) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_JSON invalido: ${error.message}`
      );
    }
  }

  if (serviceAccountPath) {
    const absolutePath = path.isAbsolute(serviceAccountPath)
      ? serviceAccountPath
      : path.join(process.cwd(), serviceAccountPath);

    // Dynamic require keeps setup simple for local MVP usage.
    // eslint-disable-next-line global-require
    return normalizeServiceAccount(require(absolutePath));
  }

  return null;
}

function initFirebase() {
  if (admin.apps.length > 0) {
    return admin.firestore();
  }

  let serviceAccount = null;
  try {
    serviceAccount = buildServiceAccount();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`Falha ao inicializar Firebase: ${error.message}`);
    return createInMemoryDb();
  }

  if (!serviceAccount) {
    // eslint-disable-next-line no-console
    console.warn(
      "Firebase nao configurado. Rodando em modo local (dados em memoria)."
    );
    return createInMemoryDb();
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
  });

  // eslint-disable-next-line no-console
  console.log("Firebase conectado com sucesso ao Firestore.");
  return admin.firestore();
}

module.exports = { initFirebase };
