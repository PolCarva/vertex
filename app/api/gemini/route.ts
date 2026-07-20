import { NextRequest } from "next/server";
import { authenticateStudent } from "@/lib/auth";
import { chargeApiKey } from "@/lib/apiKeys";
import { jsonResponse, optionsResponse } from "@/lib/cors";
import { estimateImageCost, estimateTextCost, estimateTextMaxCost } from "@/lib/costs";
import {
  generateGeminiImageWithVertex,
  generateImageToImageWithGeminiApi,
  generateImageToImageWithVertex,
  generateImageWithVertex,
  generateMediaTextWithVertex,
  generateWithVertex,
} from "@/lib/googleVertex";
import { availableModelKeys, availableModelNames, resolveModelAlias } from "@/lib/models";
import { checkRateLimit } from "@/lib/rateLimit";
import type { GeminiRequestBody } from "@/lib/types";

export const runtime = "nodejs";

const DEFAULT_MAX_PROMPT_CHARS = 4000;
const DEFAULT_MAX_OUTPUT_TOKENS = 600;
const ALLOWED_IMAGE_ASPECT_RATIOS = new Set(["1:1", "3:4", "4:3", "9:16", "16:9"]);
const ALLOWED_RESPONSE_MIME_TYPES = new Set(["text/plain", "application/json"]);
const ALLOWED_INPUT_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const ALLOWED_INPUT_AUDIO_MIME_TYPES = new Set([
  "audio/aac",
  "audio/flac",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
]);
const ALLOWED_INPUT_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/mpeg",
  "video/mov",
  "video/quicktime",
  "video/avi",
  "video/x-msvideo",
  "video/webm",
]);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalStringArray(value: unknown, maxItems = 8): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .slice(0, maxItems);

  return strings.length > 0 ? strings : undefined;
}

function parseInputImage(value: unknown): { mimeType: string; base64: string } | null {
  if (!isRecord(value)) {
    // Intentar parsear como data URL (string)
    if (typeof value === "string" && value.startsWith("data:")) {
      const match = value.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match && ALLOWED_INPUT_IMAGE_MIME_TYPES.has(match[1])) {
        return { mimeType: match[1], base64: match[2] };
      }
    }
    return null;
  }

  const mimeType = optionalString(value.mimeType);
  const base64 = optionalString(value.base64);

  if (!mimeType || !base64 || !ALLOWED_INPUT_IMAGE_MIME_TYPES.has(mimeType)) {
    return null;
  }

  return { mimeType, base64 };
}

function parseInputMedia(
  value: unknown,
  allowedMimeTypes: Set<string>,
):
  | { mimeType: string; base64: string; fileUri?: never }
  | { mimeType: string; fileUri: string; base64?: never }
  | null {
  if (!isRecord(value)) {
    if (typeof value === "string" && value.startsWith("data:")) {
      const match = value.match(/^data:([^;]+);base64,(.+)$/);
      if (match && allowedMimeTypes.has(match[1])) {
        return { mimeType: match[1], base64: match[2] };
      }
    }
    return null;
  }

  const mimeType = optionalString(value.mimeType);
  if (!mimeType || !allowedMimeTypes.has(mimeType)) {
    return null;
  }

  const base64 = optionalString(value.base64);
  if (base64) {
    return { mimeType, base64 };
  }

  const fileUri = optionalString(value.fileUri);
  if (fileUri && fileUri.startsWith("gs://")) {
    return { mimeType, fileUri };
  }

  return null;
}

function buildTextGenerationConfig(
  body: GeminiRequestBody,
  envMaxOutputTokens: number,
  modelName: string,
): { config: Record<string, unknown>; maxOutputTokens: number } {
  const rawConfig = isRecord(body.generationConfig) ? body.generationConfig : {};
  const requestedThinkingConfig = body.thinkingConfig ?? rawConfig.thinkingConfig;
  const hasThinkingConfig = isRecord(requestedThinkingConfig);
  let maxOutputTokens = clampNumber(
    body.maxOutputTokens ?? rawConfig.maxOutputTokens,
    envMaxOutputTokens,
    1,
    envMaxOutputTokens,
  );
  if (!hasThinkingConfig && modelName.includes("gemini-2.5-pro")) {
    maxOutputTokens = Math.max(maxOutputTokens, Math.min(envMaxOutputTokens, 256));
  }

  const config: Record<string, unknown> = {
    maxOutputTokens,
    temperature: clampNumber(body.temperature ?? rawConfig.temperature, 0.4, 0, 2),
  };

  const topP = body.topP ?? rawConfig.topP;
  if (typeof topP === "number") {
    config.topP = clampNumber(topP, 0.95, 0, 1);
  }

  const topK = body.topK ?? rawConfig.topK;
  if (typeof topK === "number") {
    config.topK = Math.round(clampNumber(topK, 40, 1, 100));
  }

  const candidateCount = body.candidateCount ?? rawConfig.candidateCount;
  if (typeof candidateCount === "number") {
    config.candidateCount = Math.round(clampNumber(candidateCount, 1, 1, 4));
  }

  const stopSequences = optionalStringArray(body.stopSequences ?? rawConfig.stopSequences);
  if (stopSequences) {
    config.stopSequences = stopSequences;
  }

  const responseMimeType = optionalString(body.responseMimeType ?? rawConfig.responseMimeType);
  if (responseMimeType && ALLOWED_RESPONSE_MIME_TYPES.has(responseMimeType)) {
    config.responseMimeType = responseMimeType;
  }

  const responseSchema = body.responseSchema ?? rawConfig.responseSchema;
  if (isRecord(responseSchema)) {
    config.responseSchema = responseSchema;
  }

  if (hasThinkingConfig) {
    config.thinkingConfig = requestedThinkingConfig;
  } else if (modelName.includes("gemini-2.5-pro")) {
    config.thinkingConfig = { thinkingBudget: 128 };
  } else {
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  for (const key of ["presencePenalty", "frequencyPenalty", "seed"]) {
    const value = rawConfig[key];
    if (typeof value === "number") {
      config[key] = value;
    }
  }

  return { config, maxOutputTokens };
}

function buildImageParameters(body: GeminiRequestBody): { parameters: Record<string, unknown>; sampleCount: number } {
  const rawConfig = isRecord(body.imageConfig) ? body.imageConfig : {};
  const sampleCount = Math.round(clampNumber(body.sampleCount ?? rawConfig.sampleCount, 1, 1, 4));
  const aspectRatio =
    typeof (body.aspectRatio ?? rawConfig.aspectRatio) === "string" &&
    ALLOWED_IMAGE_ASPECT_RATIOS.has((body.aspectRatio ?? rawConfig.aspectRatio) as string)
      ? ((body.aspectRatio ?? rawConfig.aspectRatio) as string)
      : "1:1";
  const parameters: Record<string, unknown> = {
    sampleCount,
    aspectRatio,
  };

  for (const key of ["negativePrompt", "personGeneration", "safetySetting", "addWatermark", "enhancePrompt"]) {
    const value = rawConfig[key];
    if (typeof value === "string" || typeof value === "boolean") {
      parameters[key] = value;
    }
  }

  const seed = rawConfig.seed;
  if (typeof seed === "number") {
    parameters.seed = Math.round(seed);
  }

  if (isRecord(rawConfig.outputOptions)) {
    parameters.outputOptions = rawConfig.outputOptions;
  }

  return { parameters, sampleCount };
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
  const envMaxOutputTokens = Math.max(256, numberFromEnv("MAX_OUTPUT_TOKENS", DEFAULT_MAX_OUTPUT_TOKENS));
  const modelAlias = resolveModelAlias({ modelKey: body.modelKey, model: body.model });

  if (!modelAlias) {
    return jsonResponse(
      request,
      {
        ok: false,
        error: `Modelo no permitido. Usá modelKey (${availableModelKeys()}) o model (${availableModelNames()}).`,
      },
      400,
    );
  }

  const { config: generationConfig, maxOutputTokens } = buildTextGenerationConfig(
    body,
    envMaxOutputTokens,
    modelAlias.model,
  );
  const { parameters: imageParameters, sampleCount } = buildImageParameters(body);

  try {
    if (modelAlias.kind === "image") {
      const reservedUsage = estimateImageCost(modelAlias, sampleCount);
      if (auth.apiKeyId && (auth.balanceUsd ?? 0) < reservedUsage.chargedUsd) {
        return jsonResponse(request, { ok: false, error: "API key sin saldo suficiente." }, 402);
      }

      const result = modelAlias.model.startsWith("gemini-")
        ? await generateGeminiImageWithVertex({
            modelAlias,
            prompt,
            generationConfig,
            safetySettings: Array.isArray(body.safetySettings) ? body.safetySettings : undefined,
          })
        : await generateImageWithVertex({
            modelAlias,
            prompt,
            parameters: imageParameters,
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

    if (modelAlias.kind === "image-to-image") {
      const inputImage = parseInputImage(body.inputImage);
      if (!inputImage) {
        return jsonResponse(
          request,
          {
            ok: false,
            error: "Falta inputImage. Debe ser un data URL (data:image/png;base64,...) o un objeto { mimeType, base64 }. Formatos aceptados: image/png, image/jpeg, image/webp, image/gif.",
          },
          400,
        );
      }

      const reservedUsage = estimateImageCost(modelAlias, sampleCount || 1);
      if (auth.apiKeyId && (auth.balanceUsd ?? 0) < reservedUsage.chargedUsd) {
        return jsonResponse(request, { ok: false, error: "API key sin saldo suficiente." }, 402);
      }

      const result =
        modelAlias.model === "gemini-3.1-flash-image-preview"
          ? await generateImageToImageWithGeminiApi({
              modelAlias,
              prompt,
              inputImage,
              generationConfig,
              safetySettings: Array.isArray(body.safetySettings) ? body.safetySettings : undefined,
            })
          : await generateImageToImageWithVertex({
              modelAlias,
              prompt,
              inputImage,
              generationConfig,
              safetySettings: Array.isArray(body.safetySettings) ? body.safetySettings : undefined,
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
          kind: "image-to-image",
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

    if (modelAlias.kind === "audio" || modelAlias.kind === "video") {
      const inputMedia = parseInputMedia(
        body.inputMedia ?? (modelAlias.kind === "audio" ? body.inputAudio : body.inputVideo),
        modelAlias.kind === "audio" ? ALLOWED_INPUT_AUDIO_MIME_TYPES : ALLOWED_INPUT_VIDEO_MIME_TYPES,
      );
      if (!inputMedia) {
        const fieldName = modelAlias.kind === "audio" ? "inputAudio" : "inputVideo";
        return jsonResponse(
          request,
          {
            ok: false,
            error: `Falta ${fieldName}. Debe ser un data URL, un objeto { mimeType, base64 } o { mimeType, fileUri } con GCS.`,
          },
          400,
        );
      }

      const reservedUsage = estimateTextMaxCost(modelAlias, prompt, maxOutputTokens);
      if (auth.apiKeyId && (auth.balanceUsd ?? 0) < reservedUsage.chargedUsd) {
        return jsonResponse(request, { ok: false, error: "API key sin saldo suficiente." }, 402);
      }

      const result = await generateMediaTextWithVertex({
        modelAlias,
        prompt,
        inputMedia,
        generationConfig,
        safetySettings: Array.isArray(body.safetySettings) ? body.safetySettings : undefined,
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
          kind: modelAlias.kind,
          text: result.text,
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
      generationConfig,
      safetySettings: Array.isArray(body.safetySettings) ? body.safetySettings : undefined,
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
