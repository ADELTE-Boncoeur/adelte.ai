# AdelTe AI — by AdelTe Industries

Flagship online-first intelligent assistant. This repo is a Vercel-ready Next.js app with a well-designed UI and a local engine (no API key required).

Operating promise: **Search intelligently. Analyze carefully. Act safely. Explain clearly. Verify honestly. Keep the user in control.**

Spec: see `AdelTe.md` (sections 1–20).

## Features (web)
- 10 models: AdelTe Local + GPT-4o / GPT-4o mini, Claude Sonnet / Haiku, Gemini Pro / Flash, DeepSeek Chat, Mistral Small / Large
- Model picker with live online/offline status (`GET /api/chat`)
- Streaming replies (SSE, `/api/chat/stream`) with Stop button
- File attachments: picker + drag-drop, sent as context to online models (5 files / 20K chars each / 60K total)
- Persistent chat + model choice (localStorage), Clear chat button
- Local safety gate on every request: L4 refused locally, L3 flagged — classification runs on your message only, never on file content
- Online failures fall back to the local engine with the error shown
- Responsive dark UI, quick prompts, keys via env only (never in chat)

## Features (terminal: `python/python/cli.py`)
- Same 10 models + `/model` picker, streaming tokens, `/attach <path>` `/files` `/clear`
- Same L0–L4 safety gate; safe PC tools (`pc_tools.py`, dry-run by default)
- Stdlib only — no `pip install` needed except `pytest` for tests

## Run locally
```powershell
npm install
npm run dev
# open http://localhost:3000
```

## Build check
```powershell
npm run build
npm start
```

## Push updates to GitHub
The repo is live at https://github.com/ADELTE-Boncoeur/adelte.ai. After any change:
```powershell
npm run build            # must pass
python -m pytest python\tests -q   # must pass
git add -A
git commit -m "Describe the change"
git push origin main
```
Vercel redeploys automatically on every push to `main`. Never commit keys (`.env.local` is gitignored).

## Go online (real models)
Without keys the app answers with the built-in local engine. To unlock online models:

Locally: copy `.env.example` to `.env.local`, fill keys, restart `npm run dev`.

On Vercel: Project → Settings → Environment Variables → add any of:
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`
→ Deployments → Redeploy. The picker shows ● online for configured models.

Get keys from: platform.openai.com, console.anthropic.com, aistudio.google.com, platform.deepseek.com, console.mistral.ai. Never paste keys in chat.

## Host on Vercel
1. Go to vercel.com → Add New → Project → Import `ADELTE-Boncoeur/adelte.ai`.
2. Framework Preset: **Next.js**. Build Command: `npm run build`. Output: `.next`.
3. Environment Variables: add API keys (see "Go online" above) for online models, or skip for local-only mode.
4. Deploy → live at `https://<project>.vercel.app`. Every push to `main` redeploys.

## Structure
```
app/
  layout.tsx, page.tsx, globals.css
  api/chat/route.ts          # JSON chat (models + local engine)
  api/chat/stream/route.ts   # SSE streaming chat
lib/
  adelte.ts                  # local rules engine (L0-L4, playbooks)
  models.ts                  # 10-model catalog + provider calls
  streaming.ts               # SSE streaming clients
  attachments.ts             # file caps + context blocks
python/
  cli.py                     # terminal chat (/model /attach /level)
  adelte_brain.py            # local engine (mirrors lib/adelte.ts)
  providers.py               # online models, stdlib only
  pc_tools.py                # safe PC tools (dry-run by default)
  tests/                     # pytest suite
AdelTe.md                    # full product spec (sections 1-20)
vercel.json
```
