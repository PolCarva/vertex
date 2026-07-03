"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ModelInfo = {
  key: string;
  kind: "text" | "image";
  model: string;
};

type ApiKeyInfo = {
  apiKey: string;
  name: string;
  ownerUsername?: string;
  balanceUsd: number;
  initialCreditUsd: number;
  totalSpendUsd: number;
  created?: boolean;
};

type UsageInfo = {
  ok: true;
  student: string;
  apiKeyId: string | null;
  balanceUsd: number | null;
  initialCreditUsd: number | null;
  totalSpendUsd: number | null;
};

type ApiResult =
  | ({
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
            dataUrl: string;
            mimeType: string;
          }>;
        }
    ))
  | {
      ok: false;
      error: string;
    };

const endpointBase = "https://gemini-vertex-student-proxy.vercel.app";
const storedApiKeyName = "gemini_proxy_api_key";

export default function HomeClient({ initialUsername }: { initialUsername: string | null }) {
  const [username, setUsername] = useState(initialUsername ?? "");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(Boolean(initialUsername));
  const [loginError, setLoginError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState("gemini-2.5-flash");
  const [prompt, setPrompt] = useState("Dame una idea para integrar IA en una app web.");
  const [temperature, setTemperature] = useState(0.4);
  const [maxOutputTokens, setMaxOutputTokens] = useState(600);
  const [responseMode, setResponseMode] = useState<"text" | "json">("text");
  const [schemaText, setSchemaText] = useState('{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"]}');
  const [sampleCount, setSampleCount] = useState(1);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [busy, setBusy] = useState("");

  const selectedModel = useMemo(() => models.find((item) => item.model === model), [models, model]);

  useEffect(() => {
    if (!loggedIn) {
      return;
    }

    void fetch("/api/models")
      .then((response) => response.json())
      .then((data: { models?: ModelInfo[] }) => {
        if (data.models?.length) {
          setModels(data.models);
          setModel(data.models[0].model);
        }
      });
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) {
      return;
    }

    const stored = window.localStorage.getItem(storedApiKeyName);
    if (stored) {
      setApiKey(stored);
      void refreshUsage(stored);
    }
  }, [loggedIn]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("login");
    setLoginError("");

    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = (await response.json()) as { ok?: boolean; username?: string; displayName?: string; error?: string };
    setBusy("");

    if (!data.ok) {
      setLoginError(data.error || "No se pudo iniciar sesion.");
      return;
    }

    setUsername(data.displayName || data.username || username);
    setLoggedIn(true);
    setPassword("");
  }

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    window.localStorage.removeItem(storedApiKeyName);
    setLoggedIn(false);
    setApiKey("");
    setApiKeyInfo(null);
    setUsage(null);
  }

  async function createKey() {
    setBusy("key");
    const response = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: username || "alumno" }),
    });
    const data = (await response.json()) as { ok?: boolean; key?: ApiKeyInfo; error?: string };
    setBusy("");

    if (!data.ok || !data.key) {
      setResult({ ok: false, error: data.error || "No se pudo crear la API key." });
      return;
    }

    setApiKey(data.key.apiKey);
    window.localStorage.setItem(storedApiKeyName, data.key.apiKey);
    setApiKeyInfo(data.key);
    setUsage({
      ok: true,
      student: data.key.name,
      apiKeyId: null,
      balanceUsd: data.key.balanceUsd,
      initialCreditUsd: data.key.initialCreditUsd,
      totalSpendUsd: data.key.totalSpendUsd,
    });
  }

  async function refreshUsage(key = apiKey) {
    if (!key) {
      return;
    }

    const response = await fetch("/api/me", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = (await response.json()) as UsageInfo | { ok: false; error: string };
    if (data.ok) {
      setUsage(data);
    }
  }

  async function testKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("test");
    setResult(null);

    let responseSchema: unknown;
    if (responseMode === "json") {
      try {
        responseSchema = JSON.parse(schemaText);
      } catch {
        setBusy("");
        setResult({ ok: false, error: "El schema JSON no es válido." });
        return;
      }
    }

    const body =
      selectedModel?.kind === "image"
        ? {
            model,
            prompt,
            imageConfig: {
              sampleCount,
              aspectRatio,
            },
          }
        : {
            model,
            prompt,
            generationConfig: {
              temperature,
              maxOutputTokens,
              ...(responseMode === "json"
                ? {
                    responseMimeType: "application/json",
                    responseSchema,
                  }
                : {}),
            },
          };

    const response = await fetch("/api/gemini", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as ApiResult;
    setResult(data);
    setBusy("");
    await refreshUsage();
  }

  if (!loggedIn) {
    return (
      <main className="page narrow">
        <section className="header">
          <h1>Gemini Proxy</h1>
          <p>Iniciá sesión con tu primer apellido y tu número de estudiante.</p>
        </section>
        <form className="panel stack" onSubmit={login}>
          <div className="field">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              placeholder="Primer apellido"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              placeholder="Número de estudiante"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <button className="button" disabled={busy === "login"} type="submit">
            {busy === "login" ? "Entrando..." : "Entrar"}
          </button>
          {loginError && <div className="message error">{loginError}</div>}
        </form>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="header dashboard-header">
        <div>
          <h1>Gemini Proxy</h1>
          <p>Creá una API key con saldo, probala con modelos permitidos y revisá el uso.</p>
        </div>
        <button className="secondary-button" onClick={logout} type="button">
          Salir
        </button>
      </section>

      <section className="grid-2">
        <div className="panel stack">
          <h2>API key</h2>
          <button className="button" disabled={busy === "key"} onClick={createKey} type="button">
            {busy === "key" ? "Creando..." : "Crear API key"}
          </button>
          {apiKey && (
            <div className="field">
              <label htmlFor="apiKey">Tu API key</label>
              <textarea id="apiKey" readOnly value={apiKey} />
              <span className="hint">Guardala ahora. Después no se vuelve a mostrar completa.</span>
            </div>
          )}
          <div className="field">
            <label htmlFor="manualKey">Usar API key existente</label>
            <input
              id="manualKey"
              value={apiKey}
              onChange={(event) => {
                const nextKey = event.target.value;
                setApiKey(nextKey);
                if (nextKey) {
                  window.localStorage.setItem(storedApiKeyName, nextKey);
                } else {
                  window.localStorage.removeItem(storedApiKeyName);
                }
              }}
              placeholder="vk_..."
            />
          </div>
          <button className="secondary-button" onClick={() => void refreshUsage()} type="button">
            Ver uso
          </button>
        </div>

        <div className="panel stack">
          <h2>Uso</h2>
          <div className="stat-grid">
            <div>
              <span className="hint">Saldo</span>
              <strong>{usage?.balanceUsd == null ? "-" : `USD ${usage.balanceUsd.toFixed(4)}`}</strong>
            </div>
            <div>
              <span className="hint">Gastado</span>
              <strong>{usage?.totalSpendUsd == null ? "-" : `USD ${usage.totalSpendUsd.toFixed(4)}`}</strong>
            </div>
            <div>
              <span className="hint">Crédito inicial</span>
              <strong>{usage?.initialCreditUsd == null ? "-" : `USD ${usage.initialCreditUsd.toFixed(2)}`}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="panel stack">
        <h2>Probar endpoint</h2>
        <form className="stack" onSubmit={testKey}>
          <div className="field">
            <label htmlFor="model">Modelo</label>
            <select id="model" value={model} onChange={(event) => setModel(event.target.value)}>
              {models.map((item) => (
                <option key={`${item.key}-${item.model}`} value={item.model}>
                  {item.model} ({item.kind})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="prompt">Prompt</label>
            <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </div>

          {selectedModel?.kind === "image" ? (
            <div className="grid-2 compact">
              <div className="field">
                <label htmlFor="sampleCount">Cantidad</label>
                <input
                  id="sampleCount"
                  max={4}
                  min={1}
                  type="number"
                  value={sampleCount}
                  onChange={(event) => setSampleCount(Number(event.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="aspectRatio">Aspect ratio</label>
                <select id="aspectRatio" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}>
                  <option value="1:1">1:1</option>
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="4:3">4:3</option>
                  <option value="3:4">3:4</option>
                </select>
              </div>
            </div>
          ) : (
            <>
              <div className="grid-2 compact">
                <div className="field">
                  <label htmlFor="temperature">Temperatura</label>
                  <input
                    id="temperature"
                    max={2}
                    min={0}
                    step={0.1}
                    type="number"
                    value={temperature}
                    onChange={(event) => setTemperature(Number(event.target.value))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="maxOutputTokens">Max output tokens</label>
                  <input
                    id="maxOutputTokens"
                    min={1}
                    type="number"
                    value={maxOutputTokens}
                    onChange={(event) => setMaxOutputTokens(Number(event.target.value))}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="responseMode">Respuesta</label>
                <select
                  id="responseMode"
                  value={responseMode}
                  onChange={(event) => setResponseMode(event.target.value as "text" | "json")}
                >
                  <option value="text">Texto</option>
                  <option value="json">JSON estructurado</option>
                </select>
              </div>
              {responseMode === "json" && (
                <div className="field">
                  <label htmlFor="schema">Response schema</label>
                  <textarea id="schema" value={schemaText} onChange={(event) => setSchemaText(event.target.value)} />
                </div>
              )}
            </>
          )}

          <button className="button" disabled={!apiKey || busy === "test"} type="submit">
            {busy === "test" ? "Probando..." : "Probar API key"}
          </button>
        </form>

        {result && (
          <div className={`message ${result.ok ? "" : "error"}`}>
            {!result.ok && result.error}
            {result.ok && result.kind === "text" && result.text}
            {result.ok && result.kind === "image" && (
              <div className="image-grid">
                {result.images.map((image, index) => (
                  <img alt={`Imagen generada ${index + 1}`} key={`${image.mimeType}-${index}`} src={image.dataUrl} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="panel stack">
        <h2>Endpoints</h2>
        <pre className="message">{`POST ${endpointBase}/api/keys
GET  ${endpointBase}/api/me
GET  ${endpointBase}/api/models
POST ${endpointBase}/api/gemini
GET  ${endpointBase}/docs`}</pre>
        <a className="button-link" href="/docs">
          Ver documentación completa
        </a>
      </section>
    </main>
  );
}
