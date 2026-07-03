from google import genai

client = genai.Client(
    vertexai=True,
    project="gen-lang-client-0710766851",
    location="us-central1",
)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Respondé con un mensaje lindo.",
)

print(response.text)