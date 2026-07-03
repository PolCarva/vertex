export type StudentAuth = {
  student: string;
  token: string;
  apiKeyId?: string;
  balanceUsd?: number;
};

export type GeminiRequestBody = {
  prompt?: unknown;
  systemInstruction?: unknown;
  modelKey?: unknown;
  maxOutputTokens?: unknown;
  temperature?: unknown;
  sampleCount?: unknown;
  aspectRatio?: unknown;
};

export type GeminiSuccessResponse = {
  ok: true;
  student: string;
  modelKey: string;
  model: string;
  usage: {
    chargedUsd: number;
    balanceUsd: number | null;
  };
} & (
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "image";
      images: Array<{
        mimeType: string;
        base64: string;
        dataUrl: string;
      }>;
    }
);

export type GeminiErrorResponse = {
  ok: false;
  error: string;
};

export type GeminiApiResponse = GeminiSuccessResponse | GeminiErrorResponse;

export type VertexGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

export type VertexPredictImageResponse = {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export type ModelKind = "text" | "image";

export type ModelAlias = {
  key: string;
  model: string;
  kind: ModelKind;
};

export type ApiKeyRecord = {
  id: string;
  name: string;
  keyHash: string;
  balanceUsd: number;
  initialCreditUsd: number;
  totalSpendUsd: number;
  createdAt: string;
  lastUsedAt: string | null;
  disabled: boolean;
};

export type UsageEstimate = {
  chargedUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
};
