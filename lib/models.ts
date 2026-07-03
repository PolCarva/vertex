import type { ModelAlias, ModelKind } from "./types";

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
];

function isModelKind(value: string): value is ModelKind {
  return value === "text" || value === "image";
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
