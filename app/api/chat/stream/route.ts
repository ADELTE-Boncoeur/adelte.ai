import { NextRequest } from "next/server";
import { classifyTask, generateAdelTeReply } from "@/lib/adelte";
import { modelLabel, generateOnlineStream } from "@/lib/streaming";
import { sanitizeAttachments, buildContextMessage, attachmentLabel, Attachment } from "@/lib/attachments";

function capNotes(notes: string[]): string {
  return notes.length > 0 ? "\n\n[" + notes.join(" ") + "]" : "";
}

function localFileNote(files: Attachment[]): string {
  if (files.length === 0) return "";
  return `\n\n[Note: ${files.length} file(s) attached (${files.map((f) => f.name).join(", ")}). The local engine can't deeply analyze file content — switch to an online model for file-aware answers.]`;
}

interface HistoryItem {
  role?: string;
  text?: string;
}

export async function POST(req: NextRequest) {
  let message = "";
  let rawHistory: HistoryItem[] = [];
  let modelId = "adelte-local";
  let attachments: unknown = [];
  try {
    const body = await req.json();
    if (typeof body.message === "string") message = body.message.slice(0, 4000);
    if (Array.isArray(body.history)) rawHistory = body.history.slice(-10);
    if (typeof body.modelId === "string") modelId = body.modelId;
    if (body.attachments !== undefined) attachments = body.attachments;
  } catch {
    return new Response('data: {"error":"Bad request"}\n\n', {
      status: 400,
      headers: { "Content-Type": "text/event-stream" }
    });
  }

  const { files, notes } = sanitizeAttachments(attachments);
  const task = classifyTask(message || (files.length > 0 ? "review the attached files" : "hello"));
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, obj: unknown) =>
    controller.enqueue(encoder.encode("data: " + JSON.stringify(obj) + "\n\n"));

  const history = rawHistory
    .filter((h) => typeof h?.text === "string")
    .map((h) => ({ role: h.role === "ai" ? ("assistant" as const) : ("user" as const), content: (h.text as string).slice(0, 2000) }));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (!message.trim() && files.length === 0) {
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
            for await (const token of generateOnlineStream(modelId, history, buildContextMessage(message, files))) {
              send(controller, { token });
            }
            if (notes.length > 0) send(controller, { token: capNotes(notes) });
            send(controller, {
              done: true, level: task.level, levelLabel: task.label, playbook: task.playbook ?? null,
              confidence: task.level === 0 ? "High" : "Medium",
              needsConfirmation: task.needsConfirmation, model: modelLabel(modelId) + attachmentLabel(files)
            });
          } catch (err) {
            const fallback = generateAdelTeReply(message);
            send(controller, { token: fallback.answer + localFileNote(files) + capNotes(notes) });
            send(controller, {
              done: true, level: task.level, levelLabel: task.label, playbook: task.playbook ?? null,
              confidence: "Low", needsConfirmation: task.needsConfirmation,
              model: "AdelTe Local (fallback)" + attachmentLabel(files),
              onlineError: err instanceof Error ? err.message : "Online model failed"
            });
          }
        } else {
          const result = generateAdelTeReply(message);
          send(controller, { token: result.answer + localFileNote(files) + capNotes(notes) });
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
