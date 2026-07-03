import { getBearerToken } from "./auth";

export function authenticateAdmin(
  authorizationHeader: string | null,
): { ok: true } | { ok: false; status: 401 | 403; error: string } {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return {
      ok: false,
      status: 403,
      error: "Falta configurar ADMIN_TOKEN en el servidor.",
    };
  }

  const token = getBearerToken(authorizationHeader);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Falta Authorization: Bearer <ADMIN_TOKEN>.",
    };
  }

  if (token !== adminToken) {
    return {
      ok: false,
      status: 403,
      error: "ADMIN_TOKEN inválido.",
    };
  }

  return { ok: true };
}
