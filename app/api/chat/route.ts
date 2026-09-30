import { NextRequest, NextResponse } from "next/server";
import { classifyTask, generateAdelTeReply } from "@/lib/adelte";
import { getAvailableModels, generateOnlineReply } from "@/lib/models";
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
  try {
    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.slice(0, 4000) : "";
    const rawHistory: HistoryItem[] = Array.isArray(body.history) ? body.history.slice(-10) : [];
    const modelId = typeof body.modelId === "string" ? body.modelId : "adelte-local";
    const { files, notes } = sanitizeAttachments(body.attachments);

    if (!message.trim() && files.length === 0) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    // Safety gate runs LOCALLY first, on the message only — never on file content.
    const task = classifyTask(message || "review the attached files");

    if (task.level === 4) {
      const refusal = generateAdelTeReply(message);
      return NextResponse.json({
        reply: refusal.answer,
        level: 4,
        levelLabel: refusal.levelLabel,
        playbook: null,
        confidence: "High",
        needsConfirmation: false,
        model: "AdelTe Local (safety gate)"
      });
    }

    const history = rawHistory
      .filter((h) => typeof h?.text === "string")
      .map((h) => ({ role: h.role === "ai" ? "assistant" as const : "user" as const, content: (h.text as string).slice(0, 2000) }));

    if (modelId && modelId !== "adelte-local") {
      try {
        const online = await generateOnlineReply(modelId, history, buildContextMessage(message, files));
        return NextResponse.json({
          reply: online.text + capNotes(notes),
          level: task.level,
          levelLabel: task.label,
          playbook: task.playbook ?? null,
          confidence: task.level === 0 ? "High" : "Medium",
          needsConfirmation: task.needsConfirmation,
          model: online.modelLabel + attachmentLabel(files)
        });
      } catch (err) {
        const fallback = generateAdelTeReply(message);
        return NextResponse.json({
          reply: fallback.answer + localFileNote(files) + capNotes(notes),
          level: task.level,
          levelLabel: task.label,
          playbook: task.playbook ?? null,
          confidence: "Low",
          needsConfirmation: task.needsConfirmation,
          model: "AdelTe Local (fallback)" + attachmentLabel(files),
          onlineError: err instanceof Error ? err.message : "Online model failed"
        });
      }
    }

    const result = generateAdelTeReply(message);
    return NextResponse.json({
      reply: result.answer + localFileNote(files) + capNotes(notes),
      level: result.level,
      levelLabel: result.levelLabel,
      playbook: result.playbook ?? null,
      confidence: result.confidence,
      needsConfirmation: result.needsConfirmation,
      model: "AdelTe Local"
    });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: "AdelTe",
    org: "AdelTe Industries",
    version: "1.3.0",
    models: getAvailableModels()
  });
}
