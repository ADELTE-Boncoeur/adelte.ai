// AdelTe model layer — many providers, zero new npm dependencies (plain fetch).
// Keys come from environment variables ONLY (Vercel dashboard or local .env.local).
// Never accept keys from chat input. Local rules engine stays as fallback + safety gate.

export type Provider = "local" | "openai" | "anthropic" | "google" | "deepseek" | "mistral";

export interface ChatModel {
  id: string;
  label: string;
  provider: Provider;
  envKey: string | null; // env var that unlocks it; null = always available
  hint: string;
}

export const MODELS: ChatModel[] = [
  { id: "adelte-local", label: "AdelTe Local", provider: "local", envKey: null, hint: "Always on — rules engine, no key, works offline" },
  { id: "gpt-4o-mini", label: "GPT-4o mini (OpenAI)", provider: "openai", envKey: "OPENAI_API_KEY", hint: "Fast + cheap" },
  { id: "gpt-4o", label: "GPT-4o (OpenAI)", provider: "openai", envKey: "OPENAI_API_KEY", hint: "Flagship OpenAI" },
  { id: "claude-3-5-haiku-20241022", label: "Claude Haiku (Anthropic)", provider: "anthropic", envKey: "ANTHROPIC_API_KEY", hint: "Fast + cheap" },
  { id: "claude-3-5-sonnet-20241022", label: "Claude Sonnet (Anthropic)", provider: "anthropic", envKey: "ANTHROPIC_API_KEY", hint: "Flagship Anthropic" },
  { id: "gemini-2.0-flash", label: "Gemini Flash (Google)", provider: "google", envKey: "GOOGLE_API_KEY", hint: "Fast + generous free tier" },
  { id: "gemini-1.5-pro", label: "Gemini Pro (Google)", provider: "google", envKey: "GOOGLE_API_KEY", hint: "Long context" },
  { id: "deepseek-chat", label: "DeepSeek Chat", provider: "deepseek", envKey: "DEEPSEEK_API_KEY", hint: "Strong + very cheap" },
  { id: "mistral-small-latest", label: "Mistral Small", provider: "mistral", envKey: "MISTRAL_API_KEY", hint: "Fast European model" },
  { id: "mistral-large-latest", label: "Mistral Large", provider: "mistral", envKey: "MISTRAL_API_KEY", hint: "Flagship Mistral" }
];

export interface ModelStatus extends ChatModel {
  available: boolean;
}

export function getAvailableModels(env: Record<string, string | undefined> = process.env): ModelStatus[] {
  return MODELS.map((m) => ({
    ...m,
    available: m.provider === "local" ? true : Boolean((env[m.envKey as string] || "").trim())
  }));
}

export const ADELTE_SYSTEM = [
  "You are AdelTe, the flagship online-first intelligent assistant created by AdelTe Industries.",
  "Mission: the most useful correct result in the least unnecessary time, while protecting the user's data, device, accounts, money, privacy, autonomy, and trust.",
  "Be fast, calm, direct, capable, professional. Answer first, then only the key reasoning or steps.",
  "Be honest about certainty (Confirmed / Likely / Possible / Unknown). Never invent sources, versions, prices, or test results.",
  "Never claim you browsed, opened, downloaded, installed, ran, or fixed anything unless the conversation shows it actually happened.",
  "Refuse credential theft, intrusion, malware, cheating/hacks, harassment, and surveillance; briefly state the boundary and offer a safe alternative.",
  "For destructive, financial, account, or system-admin actions, explain consequences and ask for explicit confirmation first.",
  "Never ask for passwords, OTP codes, recovery codes, private keys, or tokens.",
  "Use markdown with short sections and code blocks where it helps. Match the user's language."
].join("\n");

export interface WireMessage {
  role: "user" | "assistant";
  content: string;
}

function httpError(who: string, status: number, body: string): Error {
  return new Error(who + " HTTP " + status + ": " + body.slice(0, 300));
}

async function callOpenAICompatible(
  base: string, key: string, model: string, system: string, messages: WireMessage[]
): Promise<string> {
  const res = await fetch(base + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system } as const, ...messages.map((m) => ({ role: m.role, content: m.content }))],
      temperature: 0.7,
      max_tokens: 1500
    })
  });
  if (!res.ok) throw httpError("Provider", res.status, await res.text());
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error("Provider returned an empty reply");
  return text;
}

async function callAnthropic(key: string, model: string, system: string, messages: WireMessage[]): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
    })
  });
  if (!res.ok) throw httpError("Anthropic", res.status, await res.text());
  const data = await res.json() as { content?: Array<{ type?: string; text?: string }> };
  const text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("\n");
  if (!text.trim()) throw new Error("Provider returned an empty reply");
  return text;
}

async function callGoogle(key: string, model: string, system: string, messages: WireMessage[]): Promise<string> {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + encodeURIComponent(key);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
    })
  });
  if (!res.ok) throw httpError("Google", res.status, await res.text());
  const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  if (!text.trim()) throw new Error("Provider returned an empty reply");
  return text;
}

export async function generateOnlineReply(
  modelId: string,
  history: WireMessage[],
  message: string,
  env: Record<string, string | undefined> = process.env
): Promise<{ text: string; modelLabel: string }> {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error("Unknown model: " + modelId);
  if (model.provider === "local") throw new Error("adelte-local uses the built-in rules engine, not a provider");
  const key = ((env[model.envKey as string] || "") as string).trim();
  if (!key) throw new Error("Missing " + model.envKey + " — add it in Vercel → Settings → Environment Variables (or local .env.local), then redeploy/restart");
  const messages: WireMessage[] = [...history.slice(-10), { role: "user", content: message }];
  let text: string;
  if (model.provider === "openai") text = await callOpenAICompatible("https://api.openai.com/v1", key, model.id, ADELTE_SYSTEM, messages);
  else if (model.provider === "deepseek") text = await callOpenAICompatible("https://api.deepseek.com", key, model.id, ADELTE_SYSTEM, messages);
  else if (model.provider === "mistral") text = await callOpenAICompatible("https://api.mistral.ai/v1", key, model.id, ADELTE_SYSTEM, messages);
  else if (model.provider === "anthropic") text = await callAnthropic(key, model.id, ADELTE_SYSTEM, messages);
  else text = await callGoogle(key, model.id, ADELTE_SYSTEM, messages);
  return { text, modelLabel: model.label };
}
