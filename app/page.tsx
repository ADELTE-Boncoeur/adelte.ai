"use client";

import { useRef, useState } from "react";

type Msg = {
  role: "user" | "ai";
  text: string;
  levelLabel?: string;
  level?: number;
  playbook?: string | null;
  confidence?: string;
};

const QUICK = [
  "Who are you?",
  "How do I host this on Vercel?",
  "How do I push to GitHub?",
  "Fix my Next.js build error",
  "Build me a project plan",
  "My PC is slow — safe cleanup?"
];

export default function Home() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "ai",
      text: "I'm AdelTe by AdelTe Industries — Search intelligently. Analyze carefully. Act safely.\n\nTell me your goal in one sentence. I classify every task L0–L4 and ask before anything destructive.",
      level: 0,
      levelLabel: "Level 0 — Information & drafting",
      confidence: "High"
    }
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: message }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      const data = await res.json();
      setMsgs((m) => [
        ...m,
        {
          role: "ai",
          text: data.reply ?? "No reply.",
          level: data.level,
          levelLabel: data.levelLabel,
          playbook: data.playbook,
          confidence: data.confidence
        }
      ]);
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "Request failed. Check your connection and retry.", level: 0, levelLabel: "Error" }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => boxRef.current?.scrollTo({ top: 999999, behavior: "smooth" }));
    }
  }

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          <div className="logo">A</div>
          <div>
            <h1>AdelTe</h1>
            <p>by AdelTe Industries · online-first assistant · Vercel-ready</p>
          </div>
        </div>
        <div className="pill">Local mode · no API key needed · L0–L4 safety</div>
      </div>

      <div className="grid">
        <aside className="card">
          <h3>Capabilities</h3>
          <div className="cap"><span className="dot" style={{ background: "#34d399" }} />Think, research, summarize &amp; compare sources</div>
          <div className="cap"><span className="dot" style={{ background: "#22d3ee" }} />Write, review, explain &amp; fix code</div>
          <div className="cap"><span className="dot" style={{ background: "#5b8cff" }} />PC help via safe local commands</div>
          <div className="cap"><span className="dot" style={{ background: "#fbbf24" }} />Fair game coaching &amp; performance tuning</div>

          <h3 style={{ marginTop: 18 }}>Safety levels</h3>
          <div className="cap"><span className="dot" style={{ background: "#34d399" }} />L0 info · L1 reversible low-impact</div>
          <div className="cap"><span className="dot" style={{ background: "#fbbf24" }} />L2 material reversible · L3 ask first</div>
          <div className="cap"><span className="dot" style={{ background: "#f87171" }} />L4 prohibited — declined with alternative</div>

          <h3 style={{ marginTop: 18 }}>Try it</h3>
          <div className="chips">
            {QUICK.map((q) => (
              <button key={q} className="chip" onClick={() => send(q)}>{q}</button>
            ))}
          </div>
        </aside>

        <main className="card chat">
          <h3>Chat</h3>
          <div className="msgs" ref={boxRef}>
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "msg user" : "msg ai"}>
                {m.text}
                {m.role === "ai" && m.levelLabel && (
                  <div className="meta">
                    <span className={`tag l${m.level ?? 0}`}>{m.levelLabel}</span>
                    {m.playbook ? <span className="tag">{m.playbook}</span> : null}
                    {m.confidence ? <span className="tag">Confidence: {m.confidence}</span> : null}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="typing">AdelTe is thinking…</div>}
          </div>

          <div className="composer">
            <textarea
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask, paste an error, or describe the task… (Enter to send)"
            />
            <button className="btn" disabled={busy || !input.trim()} onClick={() => send()}>
              Send
            </button>
          </div>

          <div className="foot">
            <span>Never paste passwords, OTP codes, or private keys here.</span>
            <span>Spec: AdelTe.md · Promise: verify honestly, keep you in control.</span>
          </div>
        </main>
      </div>
    </div>
  );
}
