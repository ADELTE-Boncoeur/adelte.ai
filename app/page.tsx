"use client";

import { useEffect, useRef, useState } from "react";

type Msg = {
  role: "user" | "ai";
  text: string;
  levelLabel?: string;
  level?: number;
  playbook?: string | null;
  confidence?: string;
  model?: string;
  onlineError?: string;
};

type ModelStatus = {
  id: string;
  label: string;
  provider: string;
  hint: string;
  available: boolean;
};

type AttachedFile = {
  name: string;
  text: string;
};

const MAX_CLIENT_FILES = 5;
const MAX_CLIENT_CHARS = 64000;

const QUICK = [
  "Who are you?",
  "How do I host this on Vercel?",
  "How do I push to GitHub?",
  "Fix my Next.js build error",
  "Build me a project plan",
  "My PC is slow — safe cleanup?"
];

const GREETING: Msg = {
  role: "ai",
  text: "I'm AdelTe by AdelTe Industries — Search intelligently. Analyze carefully. Act safely.\n\nPick a model above. Anything marked OFFLINE needs its API key in the server environment — until then I answer with the built-in local engine.",
  level: 0,
  levelLabel: "Level 0 — Information & drafting",
  confidence: "High",
  model: "AdelTe Local"
};

function loadMsgs(): Msg[] {
  try {
    const raw = localStorage.getItem("adelte-msgs");
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) return arr.slice(-50);
    }
  } catch {}
  return [GREETING];
}

export default function Home() {
  const [msgs, setMsgs] = useState<Msg[]>(() => (typeof window === "undefined" ? [GREETING] : loadMsgs()));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<ModelStatus[]>([{ id: "adelte-local", label: "AdelTe Local", provider: "local", hint: "", available: true }]);
  const [modelId, setModelId] = useState<string>(() =>
    typeof window === "undefined" ? "adelte-local" : localStorage.getItem("adelte-model") || "adelte-local"
  );
  const boxRef = useRef<HTMLDivElement>(null);
  const msgsRef = useRef<Msg[]>(msgs);
  msgsRef.current = msgs;
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("adelte-msgs", JSON.stringify(msgs.slice(-50)));
    } catch {}
  }, [msgs]);

  useEffect(() => {
    try {
      localStorage.setItem("adelte-model", modelId);
    } catch {}
  }, [modelId]);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.models) && d.models.length > 0) {
          setModels(d.models);
          setModelId((prev) => {
            if (d.models.some((m: ModelStatus) => m.id === prev)) return prev;
            const firstOnline = d.models.find((m: ModelStatus) => m.available && m.id !== "adelte-local");
            return firstOnline ? firstOnline.id : prev;
          });
        }
      })
      .catch(() => {});
  }, []);

  const onlineCount = models.filter((m) => m.available && m.id !== "adelte-local").length;

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).slice(0, MAX_CLIENT_FILES - files.length);
    for (const f of incoming) {
      try {
        const text = (await f.text()).slice(0, MAX_CLIENT_CHARS);
        if (!text.trim()) continue;
        setFiles((prev) => (prev.length >= MAX_CLIENT_FILES ? prev : [...prev, { name: f.name || "pasted.txt", text }]));
      } catch {}
    }
  }

  async function send(text?: string) {
    const message = (text ?? input).trim();
    const attached = files;
    if ((!message && attached.length === 0) || busy) return;
    setInput("");
    setFiles([]);
    const label = attached.length > 0 ? " [attached: " + attached.map((f) => f.name).join(", ") + "]" : "";
    const history = [...msgsRef.current, { role: "user" as const, text: (message || "(see attached files)") + label }]
      .filter((m) => m.role === "user" || m.role === "ai")
      .slice(-10)
      .map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "user", text: (message || "(see attached files)") + label }]);
    setBusy(true);
    const aiIndex = msgsRef.current.length + 1;
    setMsgs((m) => [...m, { role: "ai", text: "" }]);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, modelId, attachments: attached }),
        signal: ac.signal
      });
      if (!res.ok || !res.body) throw new Error("stream failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { done: rDone, value } = await reader.read();
        if (value) buf += decoder.decode(value, { stream: !rDone });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line.slice(5));
          } catch {
            continue;
          }
          if (typeof evt.token === "string") {
            const tok = evt.token as string;
            setMsgs((m) => m.map((mm, i) => (i === aiIndex ? { ...mm, text: mm.text + tok } : mm)));
            boxRef.current?.scrollTo({ top: 999999 });
          }
          if (typeof evt.error === "string") {
            setMsgs((m) => m.map((mm, i) => (i === aiIndex ? { ...mm, text: String(evt.error), levelLabel: "Error" } : mm)));
          }
          if (evt.done) {
            const onlineError = typeof evt.onlineError === "string" ? "\n\n[Online model failed: " + evt.onlineError + " — answered with local engine.]" : "";
            setMsgs((m) =>
              m.map((mm, i) =>
                i === aiIndex
                  ? {
                      ...mm,
                      text: (mm.text || "No reply.") + onlineError,
                      level: evt.level as number,
                      levelLabel: evt.levelLabel as string,
                      playbook: (evt.playbook as string | null) ?? null,
                      confidence: evt.confidence as string,
                      model: evt.model as string
                    }
                  : mm
              )
            );
            done = true;
            break;
          }
        }
        if (rDone) break;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setMsgs((m) => m.map((mm, i) => (i === aiIndex ? { ...mm, text: (mm.text || "No reply.") + "\n\n[Stopped by user.]" } : mm)));
      } else {
        setMsgs((m) => [...m.slice(0, aiIndex), ...m.slice(aiIndex + 1), { role: "ai", text: "Request failed. Check your connection and retry.", level: 0, levelLabel: "Error" }]);
      }
    } finally {
      abortRef.current = null;
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
        <div className="pill">{onlineCount > 0 ? `${onlineCount} model${onlineCount > 1 ? "s" : ""} online` : "Local mode"} · L0–L4 safety</div>
      </div>

      <div className="grid">
        <aside className="card">
          <h3>Model</h3>
          <select className="input" value={modelId} onChange={(e) => setModelId(e.target.value)} style={{ width: "100%" }}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.available ? "● " : "○ "}{m.label}{m.available ? "" : " (needs key)"}
              </option>
            ))}
          </select>
          <div className="cap" style={{ marginTop: 8 }}>
            <span className="dot" style={{ background: onlineCount > 0 ? "#34d399" : "#fbbf24" }} />
            {onlineCount > 0
              ? "Online models answer directly; the L4/L3 safety gate still runs first."
              : "No API keys on the server — local engine answers. Add keys (see README) to go online."}
          </div>

          <h3 style={{ marginTop: 18 }}>Capabilities</h3>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Chat</h3>
            <button
              className="chip"
              disabled={busy}
              onClick={() => {
                abortRef.current?.abort();
                setMsgs([GREETING]);
              }}
            >
              Clear chat
            </button>
          </div>
          <div className="msgs" ref={boxRef}>
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "msg user" : "msg ai"}>
                {m.text}
                {m.role === "ai" && m.levelLabel && (
                  <div className="meta">
                    <span className={`tag l${m.level ?? 0}`}>{m.levelLabel}</span>
                    {m.playbook ? <span className="tag">{m.playbook}</span> : null}
                    {m.confidence ? <span className="tag">Confidence: {m.confidence}</span> : null}
                    {m.model ? <span className="tag">{m.model}</span> : null}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="typing">AdelTe is thinking…</div>}
          </div>

          {files.length > 0 && (
            <div className="chips" style={{ marginBottom: 10 }}>
              {files.map((f) => (
                <span key={f.name} className="chip" title={`${f.text.length} chars`}>
                  📎 {f.name}
                  <button
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles((prev) => prev.filter((p) => p.name !== f.name))}
                    style={{ marginLeft: 8, background: "none", border: "none", color: "inherit", cursor: "pointer" }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div
            className="composer"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
            }}
            style={dragOver ? { outline: "2px dashed var(--accent)", borderRadius: 12 } : undefined}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              className="chip"
              title="Attach text/code files (drop them here too)"
              onClick={() => fileRef.current?.click()}
              style={{ alignSelf: "center", whiteSpace: "nowrap" }}
            >
              📎 Attach
            </button>
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
              placeholder="Ask, paste an error, attach code/logs, or drop files… (Enter to send)"
            />
            <button className="btn" disabled={busy || (!input.trim() && files.length === 0)} onClick={() => send()}>
              Send
            </button>
            {busy && (
              <button className="btn" onClick={() => abortRef.current?.abort()} style={{ background: "linear-gradient(135deg,#f87171,#fbbf24)" }}>
                Stop
              </button>
            )}
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
