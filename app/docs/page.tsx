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

        <h2>2. Usar texto</h2>
        <pre className="message">{`const response = await fetch("${baseUrl}/api/gemini", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer TU_API_KEY"
  },
  body: JSON.stringify({
    model: "gemini-2.5-flash",
    prompt: "Explicame APIs en 3 frases.",
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 600
    }
  })
});`}</pre>

        <h2>3. Respuesta estructurada</h2>
        <pre className="message">{`body: JSON.stringify({
  model: "gemini-2.5-flash",
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

        <h2>4. Configuracion avanzada</h2>
        <p className="hint">
          Podés enviar temperatura, límites, respuesta estructurada y thinkingConfig.
          Si no lo enviás, el proxy usa valores seguros para que Gemini 2.5 Flash
          y Pro devuelvan texto visible.
        </p>
        <pre className="message">{`body: JSON.stringify({
  model: "gemini-2.5-pro",
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

        <h2>5. Imagen</h2>
        <pre className="message">{`body: JSON.stringify({
  model: "imagen-3.0-generate-002",
  prompt: "Un robot ensenando JavaScript en un aula moderna",
  imageConfig: {
    sampleCount: 1,
    aspectRatio: "16:9"
  }
})`}</pre>
      </section>
    </main>
  );
}
