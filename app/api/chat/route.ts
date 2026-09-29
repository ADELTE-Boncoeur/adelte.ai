import { NextRequest, NextResponse } from "next/server";
import { classifyTask, generateAdelTeReply } from "@/lib/adelte";
import { getAvailableModels, generateOnlineReply } from "@/lib/models";

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

    if (!message.trim()) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    // Safety gate runs LOCALLY first, no matter which model is selected.
    const task = classifyTask(message);

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
        const online = await generateOnlineReply(modelId, history, message);
        return NextResponse.json({
          reply: online.text,
          level: task.level,
          levelLabel: task.label,
          playbook: task.playbook ?? null,
          confidence: task.level === 0 ? "High" : "Medium",
          needsConfirmation: task.needsConfirmation,
          model: online.modelLabel
        });
      } catch (err) {
        const fallback = generateAdelTeReply(message);
        return NextResponse.json({
          reply: fallback.answer,
          level: task.level,
          levelLabel: task.label,
          playbook: task.playbook ?? null,
          confidence: "Low",
          needsConfirmation: task.needsConfirmation,
          model: "AdelTe Local (fallback)",
          onlineError: err instanceof Error ? err.message : "Online model failed"
        });
      }
    }

    const result = generateAdelTeReply(message);
    return NextResponse.json({
      reply: result.answer,
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
    version: "1.1.0",
    models: getAvailableModels()
  });
}
