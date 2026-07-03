"use client";

import { FormEvent, useState } from "react";

type ApiSuccess = {
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
);

type ApiResult =
  | ApiSuccess
  | {
      ok: false;
      error: string;
    };

export default function HomePage() {
  const [token, setToken] = useState("");
  const [modelKey, setModelKey] = useState("text");
  const [prompt, setPrompt] = useState("Dame una idea para integrar IA en una app web.");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          modelKey,
          prompt,
          temperature: 0.4,
          maxOutputTokens: 600,
          sampleCount: 1,
          aspectRatio: "1:1",
        }),
      });

      const data = (await response.json()) as ApiResult;
      setResult(data);
    } catch {
      setResult({
        ok: false,
        error: "No se pudo llamar al proxy.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="header">
        <h1>Gemini Vertex Proxy</h1>
        <p>
          Demo para probar el endpoint del proxy. Pegá un token de alumno,
          escribí un prompt y la llamada se hace desde el servidor, sin exponer
          credenciales de Google.
        </p>
      </section>

      <form className="panel stack" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="token">Token de alumno</label>
          <input
            id="token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="token-demo"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label htmlFor="modelKey">Modelo</label>
          <select
            id="modelKey"
            value={modelKey}
            onChange={(event) => setModelKey(event.target.value)}
          >
            <option value="text">Texto rápido</option>
            <option value="pro">Texto avanzado</option>
            <option value="image">Imagen</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="prompt">Prompt</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Escribí tu prompt..."
          />
        </div>

        <div className="row">
          <button className="button" disabled={loading} type="submit">
            {loading ? "Enviando..." : "Enviar"}
          </button>
          <span className="hint">Endpoint: POST /api/gemini</span>
        </div>

        {result && (
          <div className={`message ${result.ok ? "" : "error"}`}>
            {!result.ok && result.error}
            {result.ok && result.kind === "text" && (
              <>{`Alumno: ${result.student}\nAlias: ${result.modelKey}\nModelo: ${result.model}\nCargo: USD ${result.usage.chargedUsd.toFixed(6)}\nSaldo: ${
                result.usage.balanceUsd === null ? "sin control de saldo" : `USD ${result.usage.balanceUsd.toFixed(4)}`
              }\n\n${result.text}`}</>
            )}
            {result.ok && result.kind === "image" && (
              <div className="stack">
                <div>{`Alumno: ${result.student}\nAlias: ${result.modelKey}\nModelo: ${result.model}\nCargo: USD ${result.usage.chargedUsd.toFixed(6)}\nSaldo: ${
                  result.usage.balanceUsd === null ? "sin control de saldo" : `USD ${result.usage.balanceUsd.toFixed(4)}`
                }`}</div>
                <div className="image-grid">
                  {result.images.map((image, index) => (
                    <img
                      alt={`Imagen generada ${index + 1}`}
                      key={`${image.mimeType}-${index}`}
                      src={image.dataUrl}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </main>
  );
}
