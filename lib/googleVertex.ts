import { GoogleAuth } from "google-auth-library";
import type { ModelAlias, VertexGenerateContentResponse, VertexPredictImageResponse } from "./types";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }
  return value;
}

function geminiDeveloperApiKey(): string {
  const value = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!value) {
    throw new Error("Falta configurar GOOGLE_GEMINI_API_KEY o GEMINI_API_KEY para usar modelos preview de Gemini.");
  }
  return value;
}

function decodeServiceAccount(): Record<string, unknown> {
  const encoded = requiredEnv("GOOGLE_SERVICE_ACCOUNT_BASE64");

  try {
    const json = Buffer.from(encoded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_BASE64 no contiene un JSON base64 válido.");
  }
}

async function getAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    credentials: decodeServiceAccount(),
    scopes: [CLOUD_PLATFORM_SCOPE],
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;

  if (!token) {
    throw new Error("No se pudo obtener un access token para Vertex AI.");
  }

  return token;
}

function vertexEndpoint(model: string, method: "generateContent" | "predict"): { url: string; model: string } {
  const projectId = requiredEnv("GOOGLE_CLOUD_PROJECT_ID");
  const location = process.env.GOOGLE_VERTEX_LOCATION || "us-central1";
  const encodedModel = encodeURIComponent(model);

  return {
    model,
    url: `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${encodedModel}:${method}`,
  };
}

function geminiDeveloperEndpoint(model: string): { url: string; model: string } {
  const encodedModel = encodeURIComponent(model);
  const key = encodeURIComponent(geminiDeveloperApiKey());

  return {
    model,
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent?key=${key}`,
  };
}

function extractText(data: VertexGenerateContentResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

function extractInlineImages(
  data: VertexGenerateContentResponse,
): Array<{ mimeType: string; base64: string; dataUrl: string }> {
  const parts = data.candidates?.[0]?.content?.parts ?? [];

  return parts
    .map((part) => {
      const inline = part.inlineData ?? part.inline_data;
      const base64 = inline?.data;
      if (!base64) {
        return null;
      }

      const mimeType = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? "image/png";
      return {
        mimeType,
        base64,
        dataUrl: `data:${mimeType};base64,${base64}`,
      };
    })
    .filter((image): image is { mimeType: string; base64: string; dataUrl: string } => image !== null);
}

export async function generateWithVertex({
  modelAlias,
  prompt,
  systemInstruction,
  generationConfig,
  safetySettings,
}: {
  modelAlias: ModelAlias;
  prompt: string;
  systemInstruction?: string;
  generationConfig: Record<string, unknown>;
  safetySettings?: unknown[];
}): Promise<{ model: string; text: string; raw: VertexGenerateContentResponse }> {
  const { url, model } = vertexEndpoint(modelAlias.model, "generateContent");
  const accessToken = await getAccessToken();
  const payload: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig,
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  if (safetySettings) {
    payload.safetySettings = safetySettings;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as VertexGenerateContentResponse;

  if (!response.ok) {
    const message = data.error?.message || `Vertex AI devolvió HTTP ${response.status}.`;
    throw new Error(message);
  }

  const text = extractText(data);
  if (!text) {
    throw new Error("Vertex AI respondió sin texto generado.");
  }

  return { model, text, raw: data };
}

export async function generateImageWithVertex({
  modelAlias,
  prompt,
  parameters,
}: {
  modelAlias: ModelAlias;
  prompt: string;
  parameters: Record<string, unknown>;
}): Promise<{
  model: string;
  images: Array<{ mimeType: string; base64: string; dataUrl: string }>;
}> {
  const { url, model } = vertexEndpoint(modelAlias.model, "predict");
  const accessToken = await getAccessToken();
  const payload = {
    instances: [{ prompt }],
    parameters,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as VertexPredictImageResponse;

  if (!response.ok) {
    const message = data.error?.message || `Vertex AI devolvió HTTP ${response.status}.`;
    throw new Error(message);
  }

  const images =
    data.predictions
      ?.map((prediction) => {
        const base64 = prediction.bytesBase64Encoded;
        if (!base64) {
          return null;
        }

        const mimeType = prediction.mimeType || "image/png";
        return {
          mimeType,
          base64,
          dataUrl: `data:${mimeType};base64,${base64}`,
        };
      })
      .filter((image): image is { mimeType: string; base64: string; dataUrl: string } => image !== null) ??
    [];

  if (images.length === 0) {
    throw new Error("Vertex AI respondió sin imágenes generadas.");
  }

  return { model, images };
}

export async function generateImageToImageWithVertex({
  modelAlias,
  prompt,
  inputImage,
  generationConfig,
  safetySettings,
}: {
  modelAlias: ModelAlias;
  prompt: string;
  inputImage: { mimeType: string; base64: string };
  generationConfig: Record<string, unknown>;
  safetySettings?: unknown[];
}): Promise<{
  model: string;
  images: Array<{ mimeType: string; base64: string; dataUrl: string }>;
  raw: VertexGenerateContentResponse;
}> {
  const { url, model } = vertexEndpoint(modelAlias.model, "generateContent");
  const accessToken = await getAccessToken();
  const payload: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: inputImage.mimeType,
              data: inputImage.base64,
            },
          },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      ...generationConfig,
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  if (safetySettings) {
    payload.safetySettings = safetySettings;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as VertexGenerateContentResponse;

  if (!response.ok) {
    const message = data.error?.message || `Vertex AI devolvió HTTP ${response.status}.`;
    throw new Error(message);
  }

  const images = extractInlineImages(data);
  if (images.length === 0) {
    const text = extractText(data);
    throw new Error(text || "Vertex AI respondió sin imágenes generadas.");
  }

  return { model, images, raw: data };
}

export async function generateImageToImageWithGeminiApi({
  modelAlias,
  prompt,
  inputImage,
  generationConfig,
  safetySettings,
}: {
  modelAlias: ModelAlias;
  prompt: string;
  inputImage: { mimeType: string; base64: string };
  generationConfig: Record<string, unknown>;
  safetySettings?: unknown[];
}): Promise<{
  model: string;
  images: Array<{ mimeType: string; base64: string; dataUrl: string }>;
  raw: VertexGenerateContentResponse;
}> {
  const { url, model } = geminiDeveloperEndpoint(modelAlias.model);
  const { responseMimeType, responseSchema, thinkingConfig, ...safeGenerationConfig } = generationConfig;
  void responseMimeType;
  void responseSchema;
  void thinkingConfig;
  const payload: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: inputImage.mimeType,
              data: inputImage.base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      ...safeGenerationConfig,
      responseModalities: ["IMAGE"],
    },
  };

  if (safetySettings) {
    payload.safetySettings = safetySettings;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as VertexGenerateContentResponse;

  if (!response.ok) {
    const message = data.error?.message || `Gemini API devolvió HTTP ${response.status}.`;
    throw new Error(message);
  }

  const images = extractInlineImages(data);
  if (images.length === 0) {
    const text = extractText(data);
    throw new Error(text || "Gemini API respondió sin imágenes generadas.");
  }

  return { model, images, raw: data };
}

export async function generateMediaTextWithVertex({
  modelAlias,
  prompt,
  inputMedia,
  generationConfig,
  safetySettings,
}: {
  modelAlias: ModelAlias;
  prompt: string;
  inputMedia:
    | { mimeType: string; base64: string; fileUri?: never }
    | { mimeType: string; fileUri: string; base64?: never };
  generationConfig: Record<string, unknown>;
  safetySettings?: unknown[];
}): Promise<{ model: string; text: string; raw: VertexGenerateContentResponse }> {
  const { url, model } = vertexEndpoint(modelAlias.model, "generateContent");
  const accessToken = await getAccessToken();
  const mediaPart =
    "fileUri" in inputMedia
      ? {
          fileData: {
            fileUri: inputMedia.fileUri,
            mimeType: inputMedia.mimeType,
          },
        }
      : {
          inlineData: {
            mimeType: inputMedia.mimeType,
            data: inputMedia.base64,
          },
        };
  const payload: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [mediaPart, { text: prompt }],
      },
    ],
    generationConfig: {
      ...generationConfig,
      responseModalities: ["TEXT"],
      ...(modelAlias.kind === "audio" ? { audioTimestamp: true } : {}),
    },
  };

  if (safetySettings) {
    payload.safetySettings = safetySettings;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as VertexGenerateContentResponse;

  if (!response.ok) {
    const message = data.error?.message || `Vertex AI devolvió HTTP ${response.status}.`;
    throw new Error(message);
  }

  const text = extractText(data);
  if (!text) {
    throw new Error("Vertex AI respondió sin texto generado.");
  }

  return { model, text, raw: data };
}

export async function generateGeminiImageWithVertex({
  modelAlias,
  prompt,
  generationConfig,
  safetySettings,
}: {
  modelAlias: ModelAlias;
  prompt: string;
  generationConfig: Record<string, unknown>;
  safetySettings?: unknown[];
}): Promise<{
  model: string;
  images: Array<{ mimeType: string; base64: string; dataUrl: string }>;
  raw: VertexGenerateContentResponse;
}> {
  const { url, model } = vertexEndpoint(modelAlias.model, "generateContent");
  const accessToken = await getAccessToken();
  const payload: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      ...generationConfig,
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  if (safetySettings) {
    payload.safetySettings = safetySettings;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as VertexGenerateContentResponse;

  if (!response.ok) {
    const message = data.error?.message || `Vertex AI devolvió HTTP ${response.status}.`;
    throw new Error(message);
  }

  const images = extractInlineImages(data);
  if (images.length === 0) {
    const text = extractText(data);
    throw new Error(text || "Vertex AI respondió sin imágenes generadas.");
  }

  return { model, images, raw: data };
}
