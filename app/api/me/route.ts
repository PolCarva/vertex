import { NextRequest } from "next/server";
import { authenticateStudent } from "@/lib/auth";
import { jsonResponse, optionsResponse } from "@/lib/cors";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function GET(request: NextRequest) {
  const auth = await authenticateStudent(request.headers.get("authorization"));
  if (!auth.ok) {
    return jsonResponse(request, { ok: false, error: auth.error }, auth.status);
  }

  return jsonResponse(request, {
    ok: true,
    student: auth.student,
    apiKeyId: auth.apiKeyId ?? null,
    balanceUsd: auth.balanceUsd ?? null,
  });
}
