import type { StudentAuth } from "./types";
import { findApiKeyByToken } from "./apiKeys";

function parseStudentTokens(): StudentAuth[] {
  const raw = process.env.STUDENT_TOKENS ?? "";

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(":");
      if (separatorIndex === -1) {
        return null;
      }

      const student = entry.slice(0, separatorIndex).trim();
      const token = entry.slice(separatorIndex + 1).trim();
      if (!student || !token) {
        return null;
      }

      return { student, token };
    })
    .filter((entry): entry is StudentAuth => entry !== null);
}

export function getBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

export async function authenticateStudent(
  authorizationHeader: string | null,
): Promise<
  | {
      ok: true;
      student: string;
      token: string;
      apiKeyId?: string;
      balanceUsd?: number;
      initialCreditUsd?: number;
      totalSpendUsd?: number;
    }
  | { ok: false; status: 401 | 403; error: string }
> {
  const token = getBearerToken(authorizationHeader);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Falta Authorization: Bearer <token>.",
    };
  }

  const apiKey = await findApiKeyByToken(token);
  if (apiKey) {
    if (apiKey.disabled) {
      return {
        ok: false,
        status: 403,
        error: "API key deshabilitada.",
      };
    }

    if (apiKey.balanceUsd <= 0) {
      return {
        ok: false,
        status: 403,
        error: "API key sin saldo disponible.",
      };
    }

    return {
      ok: true,
      student: apiKey.name,
      token,
      apiKeyId: apiKey.id,
      balanceUsd: apiKey.balanceUsd,
      initialCreditUsd: apiKey.initialCreditUsd,
      totalSpendUsd: apiKey.totalSpendUsd,
    };
  }

  const match = parseStudentTokens().find((entry) => entry.token === token);
  if (!match) {
    return {
      ok: false,
      status: 403,
      error: "Token de alumno inválido.",
    };
  }

  return {
    ok: true,
    student: match.student,
    token,
  };
}
