const test = require("node:test");
const assert = require("node:assert/strict");

const { requireRoles } = require("../src/auth");

function runMiddleware(middleware, role) {
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  let nextCalled = false;

  middleware(
    { session: { user: role ? { role } : null } },
    response,
    () => {
      nextCalled = true;
    }
  );

  return { nextCalled, response };
}

test("autoriza administrador e voluntário a cadastrar alimentos e registrar baixas", () => {
  const manageFoods = requireRoles("volunteer", "admin");

  ["volunteer", "admin"].forEach((role) => {
    const { nextCalled, response } = runMiddleware(manageFoods, role);
    assert.equal(nextCalled, true);
    assert.equal(response.statusCode, null);
  });
});

test("mantém bloqueado o gerenciamento de alimentos para perfis sem autorização", () => {
  const manageFoods = requireRoles("volunteer", "admin");
  const { nextCalled, response } = runMiddleware(manageFoods, "visitor");

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { message: "Acesso negado." });
});
