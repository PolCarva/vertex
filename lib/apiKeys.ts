import crypto from "crypto";
import type { ApiKeyRecord } from "./types";

const INDEX_KEY = "gemini-proxy:api-keys:index";
const HASH_PREFIX = "gemini-proxy:api-key-hash:";
const RECORD_PREFIX = "gemini-proxy:api-key:";
const OWNER_PREFIX = "gemini-proxy:api-key-owner:";
const DEFAULT_KEY_CREDIT_USD = 15;

const memory = {
  hashToId: new Map<string, string>(),
  ownerToId: new Map<string, string>(),
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

function apiKeySecret(): string {
  return process.env.API_KEY_SIGNING_SECRET || process.env.ADMIN_TOKEN || "local-dev-api-key-signing-secret";
}

function makeOwnedApiKey(ownerUsername: string): { id: string; apiKey: string } {
  const id = `student-${ownerUsername}`;
  const signature = crypto.createHmac("sha256", apiKeySecret()).update(id).digest("base64url");
  return { id, apiKey: `vk_${id}_${signature}` };
}

function parseOwnedApiKey(apiKey: string): ApiKeyRecord | null {
  const match = /^vk_(student-[a-z0-9-]+)_([A-Za-z0-9_-]+)$/.exec(apiKey);
  if (!match) {
    return null;
  }

  const [, id, signature] = match;
  const expected = crypto.createHmac("sha256", apiKeySecret()).update(id).digest("base64url");
  if (signature.length !== expected.length) {
    return null;
  }

  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    )
  ) {
    return null;
  }

  const ownerUsername = id.replace(/^student-/, "");
  const creditUsd = keyCreditUsd();
  return {
    id,
    name: ownerUsername,
    ownerUsername,
    encryptedApiKey: encryptApiKey(apiKey),
    keyHash: hashApiKey(apiKey),
    balanceUsd: creditUsd,
    initialCreditUsd: creditUsd,
    totalSpendUsd: 0,
    createdAt: nowIso(),
    lastUsedAt: null,
    disabled: false,
  };
}

function encryptionSecret(): Buffer {
  const source = process.env.API_KEY_ENCRYPTION_SECRET || process.env.ADMIN_TOKEN || "local-dev-api-key-secret";
  return crypto.createHash("sha256").update(source).digest();
}

function encryptApiKey(apiKey: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptApiKey(encryptedApiKey?: string): string | null {
  if (!encryptedApiKey) {
    return null;
  }

  try {
    const [ivText, tagText, encryptedText] = encryptedApiKey.split(".");
    if (!ivText || !tagText || !encryptedText) {
      return null;
    }

    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionSecret(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
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

function ownerKey(ownerUsername: string): string {
  return `${OWNER_PREFIX}${ownerUsername}`;
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
    if (record.ownerUsername) {
      memory.ownerToId.set(record.ownerUsername, record.id);
    }
    return;
  }

  await redisCommand<"OK">(["SET", recordKey(record.id), JSON.stringify(record)]);
  await redisCommand<"OK">(["SET", hashKey(record.keyHash), record.id]);
  if (record.ownerUsername) {
    await redisCommand<"OK">(["SET", ownerKey(record.ownerUsername), record.id]);
  }
  await redisCommand<number>(["SADD", INDEX_KEY, record.id]);
}

export async function createApiKey(
  name: string,
  ownerUsername?: string,
): Promise<{ record: ApiKeyRecord; apiKey: string; created: boolean }> {
  if (ownerUsername) {
    const existing = await findApiKeyByOwner(ownerUsername);
    const existingApiKey = decryptApiKey(existing?.encryptedApiKey);
    if (existing && existingApiKey) {
      return { record: existing, apiKey: existingApiKey, created: false };
    }
  }

  const ownedKey = ownerUsername ? makeOwnedApiKey(ownerUsername) : null;
  const id = ownedKey?.id ?? crypto.randomUUID();
  const apiKey = ownedKey?.apiKey ?? makeApiKey(id);
  const keyHash = hashApiKey(apiKey);
  const creditUsd = keyCreditUsd();
  const record: ApiKeyRecord = {
    id,
    name,
    ownerUsername,
    encryptedApiKey: encryptApiKey(apiKey),
    keyHash,
    balanceUsd: creditUsd,
    initialCreditUsd: creditUsd,
    totalSpendUsd: 0,
    createdAt: nowIso(),
    lastUsedAt: null,
    disabled: false,
  };

  await saveRecord(record);
  return { record, apiKey, created: true };
}

export async function findApiKeyByOwner(ownerUsername: string): Promise<ApiKeyRecord | null> {
  const config = redisConfig();

  if (!config) {
    const id = memory.ownerToId.get(ownerUsername);
    return id ? memory.records.get(id) ?? null : null;
  }

  const id = await redisCommand<string | null>(["GET", ownerKey(ownerUsername)]);
  if (!id) {
    return null;
  }

  const raw = await redisCommand<string | null>(["GET", recordKey(id)]);
  return parseRecord(raw);
}

export async function findApiKeyByToken(token: string): Promise<ApiKeyRecord | null> {
  const keyHash = hashApiKey(token);
  const config = redisConfig();

  if (!config) {
    const id = memory.hashToId.get(keyHash);
    if (id) {
      return memory.records.get(id) ?? null;
    }

    const ownedRecord = parseOwnedApiKey(token);
    if (ownedRecord) {
      await saveRecord(ownedRecord);
      return ownedRecord;
    }

    return null;
  }

  const id = await redisCommand<string | null>(["GET", hashKey(keyHash)]);
  if (!id) {
    const ownedRecord = parseOwnedApiKey(token);
    if (ownedRecord) {
      await saveRecord(ownedRecord);
      return ownedRecord;
    }

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
