import { NextRequest, NextResponse } from "next/server";
import { jsonResponse, optionsResponse } from "@/lib/cors";
import { createSessionToken, resolveLoginUser, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

async function readJson(request: NextRequest): Promise<{ username?: unknown; password?: unknown } | null> {
  try {
    return (await request.json()) as { username?: unknown; password?: unknown };
  } catch {
    return null;
  }
}

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  const body = await readJson(request);
  const loginUser = resolveLoginUser(body?.username, body?.password);
  if (!loginUser) {
    return jsonResponse(request, { ok: false, error: "Usuario o contraseña inválidos." }, 403);
  }

  const response = jsonResponse(request, { ok: true, username: loginUser.username, displayName: loginUser.displayName });
  response.cookies.set(SESSION_COOKIE, createSessionToken(loginUser.username, loginUser.displayName), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}

export async function DELETE(request: NextRequest) {
  const response = new NextResponse(null, {
    status: 204,
  });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
