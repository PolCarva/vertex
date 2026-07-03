import type { ModelAlias, UsageEstimate, VertexGenerateContentResponse } from "./types";

const DEFAULT_TEXT_INPUT_PER_1M_USD = 0.3;
const DEFAULT_TEXT_OUTPUT_PER_1M_USD = 2.5;
const DEFAULT_IMAGE_USD = 0.04;
const MIN_CHARGE_USD = 0.000001;

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function estimateTextCost(
  modelAlias: ModelAlias,
  response: VertexGenerateContentResponse,
): UsageEstimate {
  const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
  const inputPrice = envNumber(
    `PRICE_${modelAlias.key.toUpperCase()}_INPUT_PER_1M_USD`,
    envNumber("PRICE_TEXT_INPUT_PER_1M_USD", DEFAULT_TEXT_INPUT_PER_1M_USD),
  );
  const outputPrice = envNumber(
    `PRICE_${modelAlias.key.toUpperCase()}_OUTPUT_PER_1M_USD`,
    envNumber("PRICE_TEXT_OUTPUT_PER_1M_USD", DEFAULT_TEXT_OUTPUT_PER_1M_USD),
  );
  const chargedUsd = inputTokens * (inputPrice / 1_000_000) + outputTokens * (outputPrice / 1_000_000);

  return {
    chargedUsd: Number(Math.max(chargedUsd, MIN_CHARGE_USD).toFixed(8)),
    inputTokens,
    outputTokens,
  };
}

export function estimateTextMaxCost(
  modelAlias: ModelAlias,
  prompt: string,
  maxOutputTokens: number,
): UsageEstimate {
  const estimatedInputTokens = Math.ceil(prompt.length / 4);
  const inputPrice = envNumber(
    `PRICE_${modelAlias.key.toUpperCase()}_INPUT_PER_1M_USD`,
    envNumber("PRICE_TEXT_INPUT_PER_1M_USD", DEFAULT_TEXT_INPUT_PER_1M_USD),
  );
  const outputPrice = envNumber(
    `PRICE_${modelAlias.key.toUpperCase()}_OUTPUT_PER_1M_USD`,
    envNumber("PRICE_TEXT_OUTPUT_PER_1M_USD", DEFAULT_TEXT_OUTPUT_PER_1M_USD),
  );
  const chargedUsd =
    estimatedInputTokens * (inputPrice / 1_000_000) + maxOutputTokens * (outputPrice / 1_000_000);

  return {
    chargedUsd: Number(Math.max(chargedUsd, MIN_CHARGE_USD).toFixed(8)),
    inputTokens: estimatedInputTokens,
    outputTokens: maxOutputTokens,
  };
}

export function estimateImageCost(modelAlias: ModelAlias, images: number): UsageEstimate {
  const imagePrice = envNumber(
    `PRICE_${modelAlias.key.toUpperCase()}_PER_IMAGE_USD`,
    envNumber("PRICE_IMAGE_PER_IMAGE_USD", DEFAULT_IMAGE_USD),
  );

  return {
    chargedUsd: Number(Math.max(images * imagePrice, MIN_CHARGE_USD).toFixed(8)),
    images,
  };
}
