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

function extractText(data: VertexGenerateContentResponse): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

export async function generateWithVertex({
  modelAlias,
  prompt,
  systemInstruction,
  maxOutputTokens,
  temperature,
}: {
  modelAlias: ModelAlias;
  prompt: string;
  systemInstruction?: string;
  maxOutputTokens: number;
  temperature: number;
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
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
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
  sampleCount,
  aspectRatio,
}: {
  modelAlias: ModelAlias;
  prompt: string;
  sampleCount: number;
  aspectRatio: string;
}): Promise<{
  model: string;
  images: Array<{ mimeType: string; base64: string; dataUrl: string }>;
}> {
  const { url, model } = vertexEndpoint(modelAlias.model, "predict");
  const accessToken = await getAccessToken();
  const payload = {
    instances: [{ prompt }],
    parameters: {
      sampleCount,
      aspectRatio,
    },
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
