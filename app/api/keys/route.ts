import { NextRequest } from "next/server";
import { authenticateAdmin } from "@/lib/admin";
import { createApiKey, listApiKeys } from "@/lib/apiKeys";
import { jsonResponse, optionsResponse } from "@/lib/cors";
import type { ApiKeyRecord } from "@/lib/types";

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
  };
}

async function readJson(request: NextRequest): Promise<{ name?: unknown } | null> {
  try {
    return (await request.json()) as { name?: unknown };
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
  const admin = authenticateAdmin(request.headers.get("authorization"));
  if (!admin.ok) {
    return jsonResponse(request, { ok: false, error: admin.error }, admin.status);
  }

  const body = await readJson(request);
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "alumno";
  const { record, apiKey } = await createApiKey(name);

  return jsonResponse(
    request,
    {
      ok: true,
      key: {
        ...publicRecord(record),
        apiKey,
      },
    },
    201,
  );
}
