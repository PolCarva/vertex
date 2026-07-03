# Gemini Vertex Proxy para alumnos

Proxy de IA en Next.js para que alumnos usen Gemini via Vertex AI sin recibir credenciales directas de Google Cloud.

El backend expone:

```text
POST /api/gemini
GET /api/health
GET /api/models
GET /api/me
GET /api/keys
POST /api/keys
```

Usa Google Cloud / Vertex AI con service account en base64, valida tokens simples por alumno y corre en Vercel Serverless Functions con runtime `nodejs`.

## Instalar

```bash
npm install
```

## Correr local

Creá un `.env.local` a partir de `.env.example` y completá los valores reales.

```bash
npm run dev
```

Abrí `http://localhost:3000` para usar la demo.

## Variables de entorno

```bash
GOOGLE_CLOUD_PROJECT_ID=gen-lang-client-0710766851
GOOGLE_VERTEX_LOCATION=us-central1
GOOGLE_VERTEX_MODEL=gemini-2.5-flash
ALLOWED_MODELS=text:gemini-2.5-flash:text,flash:gemini-2.5-flash:text,pro:gemini-2.5-pro:text,image:imagen-3.0-generate-002:image
GOOGLE_SERVICE_ACCOUNT_BASE64=<service-account-json-en-base64>
STUDENT_TOKENS=alumno1:token-secreto-1,alumno2:token-secreto-2,grupo-demo:token-demo
ADMIN_TOKEN=<token-admin-para-crear-api-keys>
DEFAULT_API_KEY_CREDIT_USD=15
MAX_PROMPT_CHARS=4000
MAX_OUTPUT_TOKENS=600
ALLOWED_ORIGINS=*
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
PRICE_TEXT_INPUT_PER_1M_USD=0.30
PRICE_TEXT_OUTPUT_PER_1M_USD=2.50
PRICE_IMAGE_PER_IMAGE_USD=0.04
```

No uses `NEXT_PUBLIC_` para secretos. Todo lo sensible debe quedar solo del lado servidor.

## API keys con saldo

El proxy puede generar API keys propias para alumnos. Cada key nueva arranca con `DEFAULT_API_KEY_CREDIT_USD`, por defecto `15`.

Crear una key:

```bash
curl -X POST "https://TU-PROXY.vercel.app/api/keys" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_ADMIN_TOKEN" \
  -d '{"name":"alumno1"}'
```

Respuesta:

```json
{
  "ok": true,
  "key": {
    "id": "...",
    "name": "alumno1",
    "balanceUsd": 15,
    "initialCreditUsd": 15,
    "totalSpendUsd": 0,
    "createdAt": "...",
    "lastUsedAt": null,
    "disabled": false,
    "apiKey": "vk_..."
  }
}
```

Mostrá o copiá `apiKey` en ese momento. Después no se vuelve a mostrar completa.

Listar keys y saldos:

```bash
curl "https://TU-PROXY.vercel.app/api/keys" \
  -H "Authorization: Bearer TU_ADMIN_TOKEN"
```

Consultar saldo desde una key de alumno:

```bash
curl "https://TU-PROXY.vercel.app/api/me" \
  -H "Authorization: Bearer vk_..."
```

Los tokens viejos de `STUDENT_TOKENS` siguen funcionando, pero no tienen saldo ni descuento. Para control real de presupuesto, usá las keys generadas por `/api/keys`.

## Persistencia de saldos

Para desarrollo local, si no configurás Redis, las keys y saldos viven en memoria. Eso se pierde al reiniciar.

Para Vercel real, configurá Upstash Redis:

```bash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

Sin Redis, Vercel puede reiniciar funciones serverless y perder saldos generados.

## Precios internos

El descuento de saldo es estimado y configurable. Por defecto:

```bash
PRICE_TEXT_INPUT_PER_1M_USD=0.30
PRICE_TEXT_OUTPUT_PER_1M_USD=2.50
PRICE_IMAGE_PER_IMAGE_USD=0.04
```

También podés definir precios por alias:

```bash
PRICE_PRO_INPUT_PER_1M_USD=1.25
PRICE_PRO_OUTPUT_PER_1M_USD=10
PRICE_IMAGE_PER_IMAGE_USD=0.04
```

El costo real final siempre lo controla Google Cloud Billing; este saldo interno sirve para limitar uso por alumno.

## Modelos permitidos

Los alumnos no pueden mandar cualquier modelo de Vertex AI. Solo pueden elegir un `modelKey` de la allowlist `ALLOWED_MODELS`.

Formato:

```bash
ALLOWED_MODELS=alias:modelo:tipo,alias:modelo:tipo
```

Tipos soportados:

```text
text
image
```

Ejemplo:

```bash
ALLOWED_MODELS=text:gemini-2.5-flash:text,pro:gemini-2.5-pro:text,image:imagen-3.0-generate-002:image
```

Si un modelo de Imagen cambia de nombre o no está disponible en tu región/proyecto, cambiás solo esta variable en Vercel, sin tocar el código.

## Crear la service account

1. En Google Cloud Console, entrá al proyecto `gen-lang-client-0710766851`.
2. Activá Vertex AI API si todavía no está activa.
3. Creá una service account.
4. Asignale roles mínimos sugeridos:
   - Vertex AI User
   - Service Usage Consumer
5. Creá una key JSON para esa service account.
6. Convertí el JSON a base64 en Mac:

```bash
base64 -i service-account.json | pbcopy
```

Pegá ese valor en `GOOGLE_SERVICE_ACCOUNT_BASE64`.

No subas `service-account.json` a GitHub. Este repo ya lo ignora en `.gitignore`, pero igual conviene no dejarlo dentro del proyecto.

## Configurar en Vercel

1. Importá el proyecto en Vercel.
2. En Project Settings → Environment Variables, agregá todas las variables de `.env.example`.
3. Deploy.

El endpoint final quedará similar a:

```text
https://TU-PROXY.vercel.app/api/gemini
```

## Request

```json
{
  "modelKey": "text",
  "prompt": "texto del usuario",
  "systemInstruction": "opcional",
  "maxOutputTokens": 600,
  "temperature": 0.4,
  "sampleCount": 1,
  "aspectRatio": "1:1"
}
```

`modelKey` es opcional. Si no viene, usa `text`.

Para texto se usan `systemInstruction`, `maxOutputTokens` y `temperature`.

Para imagen se usan `sampleCount` y `aspectRatio`. `sampleCount` queda limitado entre 1 y 4; `aspectRatio` permite `1:1`, `3:4`, `4:3`, `9:16` y `16:9`.

El cliente no puede elegir `PROJECT_ID`, `LOCATION`, credenciales ni modelos fuera de `ALLOWED_MODELS`.

## Consultar modelos habilitados

```js
const response = await fetch("https://TU-PROXY.vercel.app/api/models");
const data = await response.json();
console.log(data.models);
```

## Respuesta exitosa

```json
{
  "ok": true,
  "student": "alumno1",
  "modelKey": "text",
  "model": "gemini-2.5-flash",
  "usage": {
    "chargedUsd": 0.00012,
    "balanceUsd": 14.99988
  },
  "kind": "text",
  "text": "respuesta de Gemini"
}
```

Para imagen:

```json
{
  "ok": true,
  "student": "alumno1",
  "modelKey": "image",
  "model": "imagen-3.0-generate-002",
  "usage": {
    "chargedUsd": 0.04,
    "balanceUsd": 14.96
  },
  "kind": "image",
  "images": [
    {
      "mimeType": "image/png",
      "base64": "...",
      "dataUrl": "data:image/png;base64,..."
    }
  ]
}
```

## Error

```json
{
  "ok": false,
  "error": "mensaje claro"
}
```

## Ejemplo desde un proyecto de alumno

```js
const response = await fetch("https://TU-PROXY.vercel.app/api/gemini", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer token-demo",
  },
  body: JSON.stringify({
    modelKey: "text",
    prompt: "Dame una idea para integrar IA en una app web.",
  }),
});

const data = await response.json();
console.log(data);
```

Ejemplo para generar imagen:

```js
const response = await fetch("https://TU-PROXY.vercel.app/api/gemini", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer token-demo",
  },
  body: JSON.stringify({
    modelKey: "image",
    prompt: "Un robot simpático enseñando programación en un aula luminosa",
    sampleCount: 1,
    aspectRatio: "1:1",
  }),
});

const data = await response.json();
document.querySelector("img").src = data.images[0].dataUrl;
```

## Rate limit

El proxy incluye un límite básico en memoria:

```text
20 requests cada 10 minutos por token
```

Esto sirve para una demo o uso chico. En producción real, especialmente en Vercel con varias instancias serverless, conviene usar Upstash Redis, Vercel KV, Cloudflare KV o una base persistente.

## CORS

`ALLOWED_ORIGINS=*` permite llamadas desde cualquier origen.

También podés restringirlo:

```bash
ALLOWED_ORIGINS=https://app-alumno-1.vercel.app,https://app-alumno-2.vercel.app
```

## Advertencias importantes

- No uses `NEXT_PUBLIC_` para credenciales, tokens de alumnos ni service accounts.
- No subas `service-account.json` a GitHub.
- No llames a Vertex AI desde el frontend.
- Controlá costos y cuotas desde Google Cloud Billing.
- Permití solo modelos que quieras pagar desde `ALLOWED_MODELS`.
- Rotá los tokens de alumnos si alguno se filtra.
