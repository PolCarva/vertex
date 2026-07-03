import crypto from "crypto";
import type { ApiKeyRecord } from "./types";

const INDEX_KEY = "gemini-proxy:api-keys:index";
const HASH_PREFIX = "gemini-proxy:api-key-hash:";
const RECORD_PREFIX = "gemini-proxy:api-key:";
const DEFAULT_KEY_CREDIT_USD = 15;

const memory = {
  hashToId: new Map<string, string>(),
  records: new Map<string, ApiKeyRecord>(),
};

function nowIso(): string {
  return new Date().toISOString();
}

function keyCreditUsd(): number {
  const value = Number(process.env.DEFAULT_API_KEY_CREDIT_USD);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_KEY_CREDIT_USD;
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

function makeApiKey(id: string): string {
  return `vk_${id}_${crypto.randomBytes(24).toString("base64url")}`;
}

function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }
  return { url, token };
}

async function redisCommand<T>(command: Array<string | number>): Promise<T> {
  const config = redisConfig();
  if (!config) {
    throw new Error("Redis no está configurado.");
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  const data = (await response.json()) as { result?: T; error?: string };
  if (!response.ok || data.error) {
    throw new Error(data.error || "Redis devolvió un error.");
  }

  return data.result as T;
}

function recordKey(id: string): string {
  return `${RECORD_PREFIX}${id}`;
}

function hashKey(keyHash: string): string {
  return `${HASH_PREFIX}${keyHash}`;
}

function parseRecord(raw: string | null): ApiKeyRecord | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ApiKeyRecord;
  } catch {
    return null;
  }
}

async function saveRecord(record: ApiKeyRecord): Promise<void> {
  const config = redisConfig();
  if (!config) {
    memory.records.set(record.id, record);
    memory.hashToId.set(record.keyHash, record.id);
    return;
  }

  await redisCommand<"OK">(["SET", recordKey(record.id), JSON.stringify(record)]);
  await redisCommand<"OK">(["SET", hashKey(record.keyHash), record.id]);
  await redisCommand<number>(["SADD", INDEX_KEY, record.id]);
}

export async function createApiKey(name: string): Promise<{ record: ApiKeyRecord; apiKey: string }> {
  const id = crypto.randomUUID();
  const apiKey = makeApiKey(id);
  const keyHash = hashApiKey(apiKey);
  const creditUsd = keyCreditUsd();
  const record: ApiKeyRecord = {
    id,
    name,
    keyHash,
    balanceUsd: creditUsd,
    initialCreditUsd: creditUsd,
    totalSpendUsd: 0,
    createdAt: nowIso(),
    lastUsedAt: null,
    disabled: false,
  };

  await saveRecord(record);
  return { record, apiKey };
}

export async function findApiKeyByToken(token: string): Promise<ApiKeyRecord | null> {
  const keyHash = hashApiKey(token);
  const config = redisConfig();

  if (!config) {
    const id = memory.hashToId.get(keyHash);
    return id ? memory.records.get(id) ?? null : null;
  }

  const id = await redisCommand<string | null>(["GET", hashKey(keyHash)]);
  if (!id) {
    return null;
  }

  const raw = await redisCommand<string | null>(["GET", recordKey(id)]);
  return parseRecord(raw);
}

export async function listApiKeys(): Promise<ApiKeyRecord[]> {
  const config = redisConfig();
  if (!config) {
    return [...memory.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const ids = await redisCommand<string[]>(["SMEMBERS", INDEX_KEY]);
  const records = await Promise.all(
    ids.map(async (id) => parseRecord(await redisCommand<string | null>(["GET", recordKey(id)]))),
  );

  return records
    .filter((record): record is ApiKeyRecord => record !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function chargeApiKey(
  id: string,
  amountUsd: number,
): Promise<{ ok: true; record: ApiKeyRecord } | { ok: false; record: ApiKeyRecord | null }> {
  const charge = Math.max(0, Number(amountUsd.toFixed(8)));
  const config = redisConfig();

  if (!config) {
    const record = memory.records.get(id) ?? null;
    if (!record || record.disabled || record.balanceUsd < charge) {
      return { ok: false, record };
    }

    const updated = {
      ...record,
      balanceUsd: Number((record.balanceUsd - charge).toFixed(8)),
      totalSpendUsd: Number((record.totalSpendUsd + charge).toFixed(8)),
      lastUsedAt: nowIso(),
    };
    memory.records.set(id, updated);
    return { ok: true, record: updated };
  }

  const raw = await redisCommand<string | null>(["GET", recordKey(id)]);
  const record = parseRecord(raw);
  if (!record || record.disabled || record.balanceUsd < charge) {
    return { ok: false, record };
  }

  const updated = {
    ...record,
    balanceUsd: Number((record.balanceUsd - charge).toFixed(8)),
    totalSpendUsd: Number((record.totalSpendUsd + charge).toFixed(8)),
    lastUsedAt: nowIso(),
  };
  await saveRecord(updated);
  return { ok: true, record: updated };
}
