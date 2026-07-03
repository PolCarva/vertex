import { NextRequest } from "next/server";
import { jsonResponse, optionsResponse } from "@/lib/cors";

export const runtime = "nodejs";

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export function GET(request: NextRequest) {
  return jsonResponse(request, {
    ok: true,
    service: "gemini-vertex-proxy",
    model: process.env.GOOGLE_VERTEX_MODEL || "gemini-2.5-flash",
  });
}
