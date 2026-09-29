# AdelTe AI — by AdelTe Industries

Flagship online-first intelligent assistant. This repo is a Vercel-ready Next.js app with a well-designed UI and a local engine (no API key required).

Operating promise: **Search intelligently. Analyze carefully. Act safely. Explain clearly. Verify honestly. Keep the user in control.**

Spec: see `AdelTe.md` (sections 1–20).

## Features
- Chat UI with L0–L4 safety badges, playbook tags, confidence
- Local AdelTe engine (`lib/adelte.ts`): classification, boundaries, playbooks
- `/api/chat` route — works on Vercel with zero env vars
- Responsive dark UI, quick prompts, no secret handling

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

## Push to GitHub (ADELTE-Boncoeur)
1. Create an empty repo on GitHub, e.g. `pccontroller` (no README, no .gitignore).
2. Then:
```powershell
git init
git add .
git commit -m "AdelTe AI v1 — Vercel-ready Next.js app"
git branch -M main
git remote add origin https://github.com/ADELTE-Boncoeur/pccontroller.git
git push -u origin main
```
Use a Personal Access Token as password when prompted. Never paste tokens in chat.

If the repo already exists with another name, replace `pccontroller` with that name.

## Host on Vercel
1. Go to vercel.com → Add New → Project → Import your GitHub repo.
2. Framework Preset: **Next.js**. Build Command: `npm run build`. Output: `.next`.
3. No environment variables needed (local mode).
4. Deploy → live at `https://<project>.vercel.app`.

## Extend with a real model later
- Add `OPENAI_API_KEY` in Vercel → Settings → Environment Variables.
- Branch in `app/api/chat/route.ts`: if key exists, call provider; else fall back to `generateAdelTeReply`.
- Keep L4 boundaries and confirmation gates even with a model.

## Structure
```
app/
  layout.tsx, page.tsx, globals.css
  api/chat/route.ts
lib/adelte.ts
AdelTe.md
vercel.json
```
