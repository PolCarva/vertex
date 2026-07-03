import { NextRequest } from "next/server";
import { authenticateStudent } from "@/lib/auth";
import { chargeApiKey } from "@/lib/apiKeys";
import { jsonResponse, optionsResponse } from "@/lib/cors";
import { estimateImageCost, estimateTextCost, estimateTextMaxCost } from "@/lib/costs";
import { generateImageWithVertex, generateWithVertex } from "@/lib/googleVertex";
import { availableModelKeys, resolveModelAlias } from "@/lib/models";
import { checkRateLimit } from "@/lib/rateLimit";
import type { GeminiRequestBody } from "@/lib/types";

export const runtime = "nodejs";

const DEFAULT_MAX_PROMPT_CHARS = 4000;
const DEFAULT_MAX_OUTPUT_TOKENS = 600;
const ALLOWED_IMAGE_ASPECT_RATIOS = new Set(["1:1", "3:4", "4:3", "9:16", "16:9"]);

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

async function readJson(request: NextRequest): Promise<GeminiRequestBody | null> {
  try {
    return (await request.json()) as GeminiRequestBody;
  } catch {
    return null;
  }
}

export function OPTIONS(request: NextRequest) {
  return optionsResponse(request);
}

export async function POST(request: NextRequest) {
  const auth = await authenticateStudent(request.headers.get("authorization"));
  if (!auth.ok) {
    return jsonResponse(request, { ok: false, error: auth.error }, auth.status);
  }

  const rateLimit = checkRateLimit(auth.token);
  if (!rateLimit.ok) {
    return jsonResponse(
      request,
      { ok: false, error: "Límite de uso alcanzado. Probá de nuevo más tarde." },
      429,
      {
        "X-RateLimit-Limit": String(rateLimit.limit),
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
      },
    );
  }

  const body = await readJson(request);
  if (!body) {
    return jsonResponse(request, { ok: false, error: "El body debe ser JSON válido." }, 400);
  }

  if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
    return jsonResponse(request, { ok: false, error: "Falta prompt." }, 400);
  }

  const prompt = body.prompt.trim();
  const maxPromptChars = numberFromEnv("MAX_PROMPT_CHARS", DEFAULT_MAX_PROMPT_CHARS);
  if (prompt.length > maxPromptChars) {
    return jsonResponse(
      request,
      { ok: false, error: `El prompt supera el máximo de ${maxPromptChars} caracteres.` },
      400,
    );
  }

  const systemInstruction =
    typeof body.systemInstruction === "string" && body.systemInstruction.trim()
      ? body.systemInstruction.trim()
      : undefined;
  const modelAlias = resolveModelAlias(body.modelKey);

  if (!modelAlias) {
    return jsonResponse(
      request,
      {
        ok: false,
        error: `Modelo no permitido. Usá uno de estos modelKey: ${availableModelKeys()}.`,
      },
      400,
    );
  }

  const envMaxOutputTokens = numberFromEnv("MAX_OUTPUT_TOKENS", DEFAULT_MAX_OUTPUT_TOKENS);
  const maxOutputTokens = clampNumber(
    body.maxOutputTokens,
    envMaxOutputTokens,
    1,
    envMaxOutputTokens,
  );
  const temperature = clampNumber(body.temperature, 0.4, 0, 2);
  const sampleCount = Math.round(clampNumber(body.sampleCount, 1, 1, 4));
  const aspectRatio =
    typeof body.aspectRatio === "string" && ALLOWED_IMAGE_ASPECT_RATIOS.has(body.aspectRatio)
      ? body.aspectRatio
      : "1:1";

  try {
    if (modelAlias.kind === "image") {
      const reservedUsage = estimateImageCost(modelAlias, sampleCount);
      if (auth.apiKeyId && (auth.balanceUsd ?? 0) < reservedUsage.chargedUsd) {
        return jsonResponse(request, { ok: false, error: "API key sin saldo suficiente." }, 402);
      }

      const result = await generateImageWithVertex({
        modelAlias,
        prompt,
        sampleCount,
        aspectRatio,
      });
      const usage = estimateImageCost(modelAlias, result.images.length);
      const charge = auth.apiKeyId ? await chargeApiKey(auth.apiKeyId, usage.chargedUsd) : null;

      if (auth.apiKeyId && (!charge || !charge.ok)) {
        return jsonResponse(
          request,
          {
            ok: false,
            error: "La generación se completó, pero la API key no tiene saldo suficiente para registrar el cargo.",
          },
          402,
        );
      }
      const balanceUsd = charge?.ok ? charge.record.balanceUsd : null;

      return jsonResponse(
        request,
        {
          ok: true,
          student: auth.student,
          modelKey: modelAlias.key,
          model: result.model,
          usage: {
            chargedUsd: usage.chargedUsd,
            balanceUsd,
          },
          kind: "image",
          images: result.images,
        },
        200,
        {
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": String(rateLimit.remaining),
          "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
        },
      );
    }

    const reservedUsage = estimateTextMaxCost(modelAlias, prompt, maxOutputTokens);
    if (auth.apiKeyId && (auth.balanceUsd ?? 0) < reservedUsage.chargedUsd) {
      return jsonResponse(request, { ok: false, error: "API key sin saldo suficiente." }, 402);
    }

    const result = await generateWithVertex({
      modelAlias,
      prompt,
      systemInstruction,
      maxOutputTokens,
      temperature,
    });
    const usage = estimateTextCost(modelAlias, result.raw);
    const charge = auth.apiKeyId ? await chargeApiKey(auth.apiKeyId, usage.chargedUsd) : null;

    if (auth.apiKeyId && (!charge || !charge.ok)) {
      return jsonResponse(
        request,
        {
          ok: false,
          error: "La generación se completó, pero la API key no tiene saldo suficiente para registrar el cargo.",
        },
        402,
      );
    }
    const balanceUsd = charge?.ok ? charge.record.balanceUsd : null;

    return jsonResponse(
      request,
      {
        ok: true,
        student: auth.student,
        modelKey: modelAlias.key,
        model: result.model,
        usage: {
          chargedUsd: usage.chargedUsd,
          balanceUsd,
        },
        kind: "text",
        text: result.text,
      },
      200,
      {
        "X-RateLimit-Limit": String(rateLimit.limit),
        "X-RateLimit-Remaining": String(rateLimit.remaining),
        "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar respuesta.";
    return jsonResponse(request, { ok: false, error: message }, 502);
  }
}
