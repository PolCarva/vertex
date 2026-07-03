import { NextRequest } from "next/server";
import { authenticateAdmin } from "@/lib/admin";
import { createApiKey, listApiKeys } from "@/lib/apiKeys";
import { jsonResponse, optionsResponse } from "@/lib/cors";
import { getRequestSession, resolveLoginUser } from "@/lib/session";
import type { ApiKeyRecord, KeyCreateBody } from "@/lib/types";

export const runtime = "nodejs";

function publicRecord(record: ApiKeyRecord) {
  return {
    id: record.id,
    name: record.name,
    balanceUsd: record.balanceUsd,
    initialCreditUsd: record.initialCreditUsd,
    totalSpendUsd: record.totalSpendUsd,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    disabled: record.disabled,
    ownerUsername: record.ownerUsername,
  };
}

function publicSignupEnabled(): boolean {
  return process.env.PUBLIC_KEY_SIGNUP_ENABLED === "true";
}

function validSignupToken(body: KeyCreateBody | null): boolean {
  const expected = process.env.PUBLIC_KEY_SIGNUP_TOKEN;
  if (!expected) {
    return true;
  }

  return typeof body?.signupToken === "string" && body.signupToken === expected;
}

async function readJson(request: NextRequest): Promise<KeyCreateBody | null> {
  try {
    return (await request.json()) as KeyCreateBody;
  } catch {
    return null;
  }
}

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest) {
  const admin = authenticateAdmin(request.headers.get("authorization"));
  if (!admin.ok) {
    return jsonResponse(request, { ok: false, error: admin.error }, admin.status);
  }

  const records = await listApiKeys();
  return jsonResponse(request, {
    ok: true,
    keys: records.map(publicRecord),
  });
}

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  const session = getRequestSession(request);
  const bodyUser = resolveLoginUser(body?.username, body?.password);

  if (!publicSignupEnabled()) {
    const admin = authenticateAdmin(request.headers.get("authorization"));
    if (!admin.ok) {
      return jsonResponse(request, { ok: false, error: admin.error }, admin.status);
    }
  } else if (!session && (!bodyUser || !validSignupToken(body))) {
    return jsonResponse(request, { ok: false, error: "Usuario o contraseña inválidos." }, 403);
  }

  const ownerUsername = session?.username ?? bodyUser?.username;
  const fallbackName = session?.displayName ?? bodyUser?.displayName ?? ownerUsername ?? "alumno";
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : fallbackName;
  const { record, apiKey, created } = await createApiKey(name, ownerUsername);

  return jsonResponse(
    request,
    {
      ok: true,
      key: {
        ...publicRecord(record),
        apiKey,
        created,
      },
    },
    created ? 201 : 200,
  );
}
