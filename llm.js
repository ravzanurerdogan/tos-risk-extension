// Model adı: console.groq.com/docs/models sayfasından kontrol et.
// 404 / "model not found" alırsan oradaki güncel bir adı yaz.
const MODEL = "openai/gpt-oss-20b";
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  return apiKey || "";
}

// Gemini tarzı "OBJECT/STRING" yazımını standart JSON Schema'ya ("object/string") çevirir.
// Böylece analyze.js ve sidepanel.js'teki şemalara dokunmamıza gerek kalmaz.
function toJsonSchema(s) {
  if (Array.isArray(s)) return s.map(toJsonSchema);
  if (s && typeof s === "object") {
    const out = {};
    for (const [k, v] of Object.entries(s)) {
      out[k] = k === "type" && typeof v === "string" ? v.toLowerCase() : toJsonSchema(v);
    }
    return out;
  }
  return s;
}

async function postChat(key, body) {
  return fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify(body),
  });
}

// prompt: string, schema: şema nesnesi. Geriye ayrıştırılmış JSON döner.
async function callLLM(prompt, schema) {
  const key = await getApiKey();
  if (!key) throw new Error("API anahtarı girilmemiş.");
  const jsonSchema = toJsonSchema(schema);

  const base = {
    model: MODEL,
    temperature: 0,
    max_completion_tokens: 6000, // düşünme + JSON için yeterli pay
    messages: [{ role: "user", content: prompt }],
  };
  // gpt-oss modellerinde düşünmeyi kıs (diğer modellerde bu alan hata verir)
  if (MODEL.includes("gpt-oss")) base.reasoning_effort = "low";

  const sirayla = [
    // 1. şemalı mod
    {
      ...base,
      response_format: { type: "json_schema", json_schema: { name: "rapor", schema: jsonSchema } },
    },
    // 2. yedek: json_object modu, şema prompt'a eklenir
    {
      ...base,
      messages: [{
        role: "user",
        content: prompt + "\n\nSadece şu JSON şemasına uyan geçerli JSON döndür:\n" + JSON.stringify(jsonSchema),
      }],
      response_format: { type: "json_object" },
    },
  ];

  let sonHata = "";
  for (const body of sirayla) {
    const res = await postChat(key, body);
    if (res.ok) {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) { sonHata = "LLM boş cevap döndü."; continue; }
      try {
        return JSON.parse(text);
      } catch {
        sonHata = "LLM geçersiz JSON döndürdü.";
        continue;
      }
    }
    const errText = await res.text();
    sonHata = "LLM hatası " + res.status + ": " + errText.slice(0, 300);
    // Sadece biçim/JSON sorunlarında yedek moda geç; 401, 429 gibi hatalarda dur
    const biciminSorunu =
      res.status === 400 &&
      (errText.includes("json_validate_failed") ||
        errText.includes("response format") ||
        errText.includes("json_schema"));
    if (!biciminSorunu) throw new Error(sonHata);
  }
  throw new Error(sonHata);
}

// Eski kodun çalışmaya devam etmesi için takma ad
const callGemini = callLLM;