const baseUrl = "https://gemini-vertex-student-proxy.vercel.app";

export default function DocsPage() {
  return (
    <main className="page">
      <section className="header">
        <h1>Documentacion del proxy</h1>
        <p>
          Guia rapida para crear una API key con saldo y usar cualquier modelo
          permitido desde proyectos de alumnos.
        </p>
      </section>

      <section className="panel stack">
        <h2>1. Crear una API key</h2>
        <p className="hint">
          Primero iniciá sesión en la pantalla principal con tu primer apellido
          y tu número de estudiante. Mayúsculas, minúsculas y tildes cuentan
          como el mismo usuario. Cada alumno puede tener una sola API key; si
          ya la creaste, el dashboard recupera la misma.
        </p>
        <pre className="message">{`const response = await fetch("${baseUrl}/api/keys", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "mi-nombre"
  })
});

const data = await response.json();
console.log(data.key.apiKey);`}</pre>

        <h2>2. Modelos disponibles</h2>
        <p className="hint">
          Podés elegir el modelo con <code>modelKey</code> (alias corto,
          recomendado) o con <code>model</code> (nombre completo en Vertex AI).
          Si no enviás ninguno, se usa <code>text</code>.
        </p>
        <pre className="message">{`modelKey      model                       tipo             uso
---------------------------------------------------------------------------------
text          gemini-2.5-flash            text             texto por defecto
flash         gemini-2.5-flash            text             texto rapido
pro           gemini-2.5-pro              text             texto avanzado (thinking)
image         imagen-3.0-generate-002     image            generar imagen desde prompt
image-to-image gemini-2.5-flash-image    image-to-image   generar imagen desde otra imagen
image-to-image-preview gemini-3.1-flash-image-preview image-to-image   generar imagen preview
audio         gemini-2.5-flash            audio            analizar audio
video         gemini-2.5-flash            video            analizar video`}</pre>

        <h2>3. Usar texto</h2>
        <pre className="message">{`const response = await fetch("${baseUrl}/api/gemini", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer TU_API_KEY"
  },
  body: JSON.stringify({
    modelKey: "flash",
    prompt: "Explicame APIs en 3 frases.",
    systemInstruction: "Sos un docente claro y conciso.",
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 600
    }
  })
});`}</pre>

        <h2>4. Respuesta estructurada</h2>
        <pre className="message">{`body: JSON.stringify({
  modelKey: "flash",
  prompt: "Dame 3 ideas de apps.",
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: {
      type: "object",
      properties: {
        ideas: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["ideas"]
    }
  }
})`}</pre>

        <h2>5. Configuracion avanzada</h2>
        <p className="hint">
          Podés enviar temperatura, límites, respuesta estructurada y thinkingConfig.
          Si no lo enviás, el proxy usa valores seguros para que Gemini 2.5 Flash
          y Pro devuelvan texto visible. Por defecto Pro usa <code>thinkingBudget: 128</code>{" "}
          y Flash usa <code>0</code>.
        </p>
        <pre className="message">{`body: JSON.stringify({
  modelKey: "pro",
  prompt: "Compará REST y GraphQL en pocas líneas.",
  generationConfig: {
    temperature: 0.3,
    topP: 0.95,
    maxOutputTokens: 800,
    thinkingConfig: {
      thinkingBudget: 128
    }
  }
})`}</pre>

        <h2>6. Imagen (Imagen 3.0)</h2>
        <pre className="message">{`body: JSON.stringify({
  modelKey: "image",
  prompt: "Un robot ensenando JavaScript en un aula moderna",
  imageConfig: {
    sampleCount: 1,
    aspectRatio: "16:9",
    // Parámetros opcionales:
    negativePrompt: "borroso, mala calidad",
    personGeneration: "allow_adult",
    addWatermark: false,
    enhancePrompt: true,
    seed: 42
  }
})`}</pre>
        <p className="hint">
          Aspect ratios permitidos: <code>1:1</code>, <code>3:4</code>,{" "}
          <code>4:3</code>, <code>9:16</code>, <code>16:9</code>.{" "}
          <code>sampleCount</code> entre 1 y 4.
        </p>

        <h2>7. Imagen a partir de imagen</h2>
        <p className="hint">
          Con <code>modelKey: &quot;image-to-image&quot;</code> (Gemini 2.5 Flash Image) podés
          enviar una imagen de entrada y un prompt para generar una nueva
          imagen basada en ella. Formatos aceptados: PNG, JPEG, WebP y GIF.
          También podés usar <code>image-to-image-preview</code> para el modelo
          <code>gemini-3.1-flash-image-preview</code>.
        </p>
        <pre className="message">{`body: JSON.stringify({
  modelKey: "image-to-image",
  prompt: "Convertir el fondo en un atardecer sobre el mar",
  inputImage: "data:image/png;base64,iVBORw0KGgo...",
  generationConfig: {
    temperature: 0.7,
    maxOutputTokens: 1024
  }
})`}</pre>
        <p className="hint">
          También podés pasar <code>inputImage</code> como objeto:{" "}
          <code>{`{ mimeType: "image/png", base64: "..." }`}</code>.
        </p>

        <h2>8. Audio y video</h2>
        <p className="hint">
          <code>audio</code> y <code>video</code> usan Gemini multimodal para
          analizar archivos y responder texto. Podés enviar un data URL, un
          objeto con <code>base64</code> o una URI de Google Cloud Storage.
        </p>
        <pre className="message">{`body: JSON.stringify({
  modelKey: "audio",
  prompt: "Transcribí y resumí este audio.",
  inputAudio: {
    mimeType: "audio/mpeg",
    fileUri: "gs://mi-bucket/audio.mp3"
  }
})

body: JSON.stringify({
  modelKey: "video",
  prompt: "Describí qué sucede en este video.",
  inputVideo: "data:video/mp4;base64,AAAA..."
})`}</pre>
      </section>
    </main>
  );
}
