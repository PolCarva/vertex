import { NextRequest, NextResponse } from "next/server";
import type { GeminiApiResponse } from "./types";

const DEFAULT_METHODS = "GET,POST,OPTIONS";
const DEFAULT_HEADERS = "Content-Type,Authorization";

function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS || "*")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function corsHeaders(request: NextRequest): HeadersInit {
  const origins = allowedOrigins();
  const requestOrigin = request.headers.get("origin");
  const allowAny = origins.includes("*");
  const allowedOrigin =
    allowAny || !requestOrigin
      ? "*"
      : origins.includes(requestOrigin)
        ? requestOrigin
        : origins[0] || "";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": DEFAULT_METHODS,
    "Access-Control-Allow-Headers": DEFAULT_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function optionsResponse(request: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export function jsonResponse(
  request: NextRequest,
  body: GeminiApiResponse | Record<string, unknown>,
  status = 200,
  extraHeaders: HeadersInit = {},
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...corsHeaders(request),
      ...extraHeaders,
    },
  });
}
