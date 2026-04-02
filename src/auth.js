function getSystemUsers() {
  return [
    {
      username: process.env.ADMIN_USER || "admin",
      password: process.env.ADMIN_PASSWORD || "admin123",
      role: "admin"
    },
    {
      username: process.env.VOLUNTEER_USER || "voluntario",
      password: process.env.VOLUNTEER_PASSWORD || "voluntario123",
      role: "volunteer"
    }
  ];
}

function authenticate(username, password) {
  const user = getSystemUsers().find(
    (candidate) =>
      candidate.username.toLowerCase() === String(username).toLowerCase() &&
      candidate.password === password
  );

  if (!user) {
    return null;
  }

  return { username: user.username, role: user.role };
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ message: "Nao autenticado." });
  }

  return next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ message: "Nao autenticado." });
    }

    if (req.session.user.role !== role) {
      return res.status(403).json({ message: "Acesso negado." });
    }

    return next();
  };
}

module.exports = { authenticate, requireAuth, requireRole };
