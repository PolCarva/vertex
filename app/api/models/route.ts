import { NextRequest } from "next/server";
import { jsonResponse, optionsResponse } from "@/lib/cors";
import { getModelAliases } from "@/lib/models";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export function GET(request: NextRequest) {
  return jsonResponse(request, {
    ok: true,
    models: getModelAliases().map((alias) => ({
      key: alias.key,
      kind: alias.kind,
      model: alias.model,
    })),
  });
}
