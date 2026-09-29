// AdelTe streaming — SSE clients for every provider, zero new dependencies.
// Pure extractor functions are unit-testable offline; the generator needs a key.

import { MODELS, ADELTE_SYSTEM } from "./models";
import type { WireMessage } from "./models";

export type Extractor = (event: string, json: unknown) => string | null;

type AnyRec = Record<string, unknown>;

function asRec(v: unknown): AnyRec | null {
  return typeof v === "object" && v !== null ? (v as AnyRec) : null;
}

function asStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** OpenAI / DeepSeek / Mistral (OpenAI-compatible SSE). */
export function extractOpenAI(_event: string, json: unknown): string | null {
  const root = asRec(json);
  const choice = asRec((root?.["choices"] as unknown[] | undefined)?.[0]);
  const delta = asRec(choice?.["delta"]);
  const t = asStr(delta?.["content"]);
  if (t !== null) return t;
  const msg = asRec(choice?.["message"]);
  return asStr(msg?.["content"]);
}

/** Anthropic SSE: only content_block_delta carries text. */
export function extractAnthropic(event: string, json: unknown): string | null {
  if (event !== "content_block_delta") return null;
  return asStr(asRec(asRec(json)?.["delta"])?.["text"]);
}

/** Google Gemini SSE (alt=sse): candidates[0].content.parts[].text */
export function extractGoogle(_event: string, json: unknown): string | null {
  const root = asRec(json);
  const cand = asRec((root?.["candidates"] as unknown[] | undefined)?.[0]);
  const parts = cand?.["content"] !== null ? (asRec(cand?.["content"])?.["parts"] as unknown[] | undefined) : undefined;
  if (!Array.isArray(parts)) return null;
  const text = parts.map((p) => asStr(asRec(p)?.["text"]) || "").join("");
  return text || null;
}

async function errorText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "";
  }
}

export async function* streamProviderSSE(
  url: string, init: RequestInit, extract: Extractor
): AsyncGenerator<string> {
  const res = await fetch(url, init);
  if (!res.ok || !res.body) throw new Error("Provider HTTP " + res.status + ": " + (await errorText(res)));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let event = "";
  outer: while (true) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: !done });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (line === "") {
        event = "";
        continue;
      }
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
        if (event === "message_stop" || event === "error" || event === "message_complete") break outer;
        continue;
      }
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") break outer;
      let json: unknown = null;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }
      const t = extract(event, json);
      if (t) yield t;
    }
    if (done) break;
  }
}

export function modelLabel(modelId: string): string {
  return MODELS.find((m) => m.id === modelId)?.label || modelId;
}

export async function* generateOnlineStream(
  modelId: string,
  history: WireMessage[],
  message: string,
  env: Record<string, string | undefined> = process.env
): AsyncGenerator<string> {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error("Unknown model: " + modelId);
  if (model.provider === "local") throw new Error("adelte-local uses the built-in rules engine, not a provider");
  const key = ((env[model.envKey as string] || "") as string).trim();
  if (!key) throw new Error("Missing " + model.envKey);
  const messages: WireMessage[] = [...history.slice(-10), { role: "user", content: message }];
  const sys: { role: string; content: string }[] = [{ role: "system", content: ADELTE_SYSTEM }, ...messages];

  if (model.provider === "openai" || model.provider === "deepseek" || model.provider === "mistral") {
    const base =
      model.provider === "openai"
        ? "https://api.openai.com/v1"
        : model.provider === "deepseek"
          ? "https://api.deepseek.com"
          : "https://api.mistral.ai/v1";
    yield* streamProviderSSE(
      base + "/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify({ model: model.id, stream: true, temperature: 0.7, max_tokens: 1500, messages: sys })
      },
      extractOpenAI
    );
    return;
  }
  if (model.provider === "anthropic") {
    yield* streamProviderSSE(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: model.id, stream: true, max_tokens: 1500, system: ADELTE_SYSTEM, messages })
      },
      extractAnthropic
    );
    return;
  }
  yield* streamProviderSSE(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model.id + ":generateContent?key=" +
      encodeURIComponent(key) + "&alt=sse",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: ADELTE_SYSTEM }] },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }]
        }))
      })
    },
    extractGoogle
  );
}
