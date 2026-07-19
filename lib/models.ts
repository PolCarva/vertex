import type { ModelAlias, ModelKind } from "./types";

/**
 * Alias de modelos disponibles para los alumnos.
 *
 * Cada entrada define un `key` (alias que el alumno usa en `modelKey`),
 * el `model` real de Vertex AI, y el `kind` que determina cómo se
 * procesa la request y cómo se calcula el costo.
 *
 * Tipos soportados:
 * - `text`: modelos de lenguaje (generateContent). El prompt se envía como texto.
 * - `image`: modelos de generación de imágenes (predict, Imagen). El prompt genera imágenes desde cero.
 * - `image-to-image`: modelos multimodales que reciben una imagen de entrada y generan imágenes nuevas (generateContent con responseModalities: IMAGE).
 * - `audio`: modelos multimodales que reciben audio y devuelven texto (generateContent).
 * - `video`: modelos multimodales que reciben video y devuelven texto (generateContent).
 *
 * Para agregar o cambiar modelos, usá la variable de entorno ALLOWED_MODELS
 * con formato `alias:modelo:tipo,alias:modelo:tipo`.
 */
const DEFAULT_MODEL_ALIASES: ModelAlias[] = [
  {
    key: "text",
    model: process.env.GOOGLE_VERTEX_MODEL || "gemini-2.5-flash",
    kind: "text",
  },
  {
    key: "flash",
    model: "gemini-2.5-flash",
    kind: "text",
  },
  {
    key: "pro",
    model: "gemini-2.5-pro",
    kind: "text",
  },
  {
    key: "image",
    model: "imagen-3.0-generate-002",
    kind: "image",
  },
  {
    key: "image-to-image",
    model: process.env.GOOGLE_VERTEX_IMAGE_TO_IMAGE_MODEL || "gemini-2.5-flash-image",
    kind: "image-to-image",
  },
  {
    key: "audio",
    model: process.env.GOOGLE_VERTEX_AUDIO_MODEL || "gemini-2.5-flash",
    kind: "audio",
  },
  {
    key: "video",
    model: process.env.GOOGLE_VERTEX_VIDEO_MODEL || "gemini-2.5-flash",
    kind: "video",
  },
];

function isModelKind(value: string): value is ModelKind {
  return value === "text" || value === "image" || value === "image-to-image" || value === "audio" || value === "video";
}

function parseModelAliasEntry(entry: string): ModelAlias | null {
  const [key, model, kind] = entry.split(":").map((part) => part.trim());

  if (!key || !model || !kind || !isModelKind(kind)) {
    return null;
  }

  return { key, model, kind };
}

export function getModelAliases(): ModelAlias[] {
  const raw = process.env.ALLOWED_MODELS;
  if (!raw) {
    return DEFAULT_MODEL_ALIASES;
  }

  const parsed = raw
    .split(",")
    .map(parseModelAliasEntry)
    .filter((entry): entry is ModelAlias => entry !== null);

  return parsed.length > 0 ? parsed : DEFAULT_MODEL_ALIASES;
}

export function resolveModelAlias({
  modelKey,
  model,
}: {
  modelKey?: unknown;
  model?: unknown;
}): ModelAlias | null {
  const aliases = getModelAliases();

  if (typeof model === "string" && model.trim()) {
    const requestedModel = model.trim();
    return aliases.find((alias) => alias.model === requestedModel) ?? null;
  }

  const requestedKey = typeof modelKey === "string" && modelKey.trim() ? modelKey.trim() : "text";
  return aliases.find((alias) => alias.key === requestedKey) ?? null;
}

export function availableModelKeys(): string {
  return getModelAliases()
    .map((alias) => alias.key)
    .join(", ");
}

export function availableModelNames(): string {
  return [...new Set(getModelAliases().map((alias) => alias.model))].join(", ");
}
