export function send(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// El panel del negocio (CRM y agenda con nombres) pide la clave ADMIN_TOKEN en el header x-admin-token.
export function isAdmin(req) {
  const t = process.env.ADMIN_TOKEN;
  return Boolean(t) && req.headers["x-admin-token"] === t;
}

export const clip = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
