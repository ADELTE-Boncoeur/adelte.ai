import { NextRequest } from "next/server";
import { classifyTask, generateAdelTeReply } from "@/lib/adelte";
import { modelLabel, generateOnlineStream } from "@/lib/streaming";

interface HistoryItem {
  role?: string;
  text?: string;
}

export async function POST(req: NextRequest) {
  let message = "";
  let rawHistory: HistoryItem[] = [];
  let modelId = "adelte-local";
  try {
    const body = await req.json();
    if (typeof body.message === "string") message = body.message.slice(0, 4000);
    if (Array.isArray(body.history)) rawHistory = body.history.slice(-10);
    if (typeof body.modelId === "string") modelId = body.modelId;
  } catch {
    return new Response('data: {"error":"Bad request"}\n\n', {
      status: 400,
      headers: { "Content-Type": "text/event-stream" }
    });
  }

  const task = classifyTask(message || "hello");
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) =>
    controller.enqueue(encoder.encode("data: " + JSON.stringify(obj) + "\n\n"));

  const history = rawHistory
    .filter((h) => typeof h?.text === "string")
    .map((h) => ({ role: h.role === "ai" ? ("assistant" as const) : ("user" as const), content: (h.text as string).slice(0, 2000) }));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!message.trim()) {
          send(controller, { error: "Empty message" });
        } else if (task.level === 4) {
          // Safety gate: refused locally, never streamed to a provider.
          const refusal = generateAdelTeReply(message);
          send(controller, { token: refusal.answer });
          send(controller, {
            done: true, level: 4, levelLabel: refusal.levelLabel, playbook: null,
            confidence: "High", needsConfirmation: false, model: "AdelTe Local (safety gate)"
          });
        } else if (modelId && modelId !== "adelte-local") {
          try {
            for await (const token of generateOnlineStream(modelId, history, message)) {
              send(controller, { token });
            }
            send(controller, {
              done: true, level: task.level, levelLabel: task.label, playbook: task.playbook ?? null,
              confidence: task.level === 0 ? "High" : "Medium",
              needsConfirmation: task.needsConfirmation, model: modelLabel(modelId)
            });
          } catch (err) {
            const fallback = generateAdelTeReply(message);
            send(controller, { token: fallback.answer });
            send(controller, {
              done: true, level: task.level, levelLabel: task.label, playbook: task.playbook ?? null,
              confidence: "Low", needsConfirmation: task.needsConfirmation,
              model: "AdelTe Local (fallback)",
              onlineError: err instanceof Error ? err.message : "Online model failed"
            });
          }
        } else {
          const result = generateAdelTeReply(message);
          send(controller, { token: result.answer });
          send(controller, {
            done: true, level: result.level, levelLabel: result.levelLabel,
            playbook: result.playbook ?? null, confidence: result.confidence,
            needsConfirmation: result.needsConfirmation, model: "AdelTe Local"
          });
        }
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}
