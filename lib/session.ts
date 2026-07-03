import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { findStudentUser } from "./students";

export const SESSION_COOKIE = "gemini_proxy_session";

function sessionSecret(): string {
  return process.env.SESSION_SECRET || process.env.ADMIN_TOKEN || "local-dev-session-secret";
}

export function signupCredentials(): { username: string; password: string } {
  return {
    username: process.env.SIGNUP_USERNAME || "curso",
    password: process.env.SIGNUP_PASSWORD || "gemini-class-2026",
  };
}

export function validateSignupCredentials(username: unknown, password: unknown): username is string {
  const student = findStudentUser(username, password);
  if (student) {
    return true;
  }

  const expected = signupCredentials();
  return username === expected.username && password === expected.password;
}

export function resolveLoginUser(username: unknown, password: unknown): { username: string; displayName: string } | null {
  const student = findStudentUser(username, password);
  if (student) {
    return {
      username: student.username,
      displayName: student.displayName,
    };
  }

  const expected = signupCredentials();
  if (username === expected.username && password === expected.password) {
    return {
      username: expected.username,
      displayName: expected.username,
    };
  }

  return null;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(username: string, displayName = username): string {
  const payload = Buffer.from(
    JSON.stringify({
      username,
      displayName,
      iat: Date.now(),
    }),
    "utf8",
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): { username: string; displayName: string } | null {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      username?: unknown;
      displayName?: unknown;
      iat?: unknown;
    };
    if (typeof data.username !== "string") {
      return null;
    }

    return { username: data.username, displayName: typeof data.displayName === "string" ? data.displayName : data.username };
  } catch {
    return null;
  }
}

export function getRequestSession(request: NextRequest): { username: string; displayName: string } | null {
  return verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export async function getPageSession(): Promise<{ username: string; displayName: string } | null> {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}
