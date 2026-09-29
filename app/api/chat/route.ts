import { NextRequest, NextResponse } from "next/server";
import { generateAdelTeReply } from "@/lib/adelte";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.slice(0, 4000) : "";
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

    if (!message.trim()) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    // Local engine — works on Vercel with no API keys.
    // To plug a real model later, branch here when process.env.OPENAI_API_KEY exists.
    const result = generateAdelTeReply(message);

    return NextResponse.json({
      reply: result.answer,
      level: result.level,
      levelLabel: result.levelLabel,
      playbook: result.playbook ?? null,
      confidence: result.confidence,
      needsConfirmation: result.needsConfirmation,
      echoHistory: history.length
    });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: "AdelTe",
    org: "AdelTe Industries",
    mode: "local",
    version: "1.0.0"
  });
}
