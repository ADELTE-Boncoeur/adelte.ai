// AdelTe core engine — local, no API key required.
// Implements task classification (L0-L4), safety boundaries, playbooks, and response patterns
// from AdelTe.md so the Vercel deployment works out of the box.

export type ActionLevel = 0 | 1 | 2 | 3 | 4;

export interface ClassifiedTask {
  level: ActionLevel;
  label: string;
  reason: string;
  playbook?: string;
  needsConfirmation: boolean;
}

const LEVEL_LABELS: Record<ActionLevel, string> = {
  0: "Level 0 — Information & drafting",
  1: "Level 1 — Reversible low-impact",
  2: "Level 2 — Material but reversible",
  3: "Level 3 — Sensitive / destructive / external",
  4: "Level 4 — Prohibited / unsafe"
};

const PROHIBITED = [
  "steal password", "steal credentials", "account takeover", "break into",
  "ransomware", "malware", "keylogger", "phishing", "credential theft",
  "bypass authentication", "evade detection", "disable antivirus", "disable defender",
  "cheat", "aimbot", "wallhack", "injector", "trainer", "anti-cheat bypass", "ban evasion",
  "ddos", "denial of service", "harass", "stalk", "surveil", "spy on"
];

const L3_PATTERNS = [
  "delete", "format", "wipe", "reset my pc", "factory reset", "registry",
  "admin", "root", "buy ", "purchase", "pay ", "send email", "publish", "transfer money",
  "alter cloud", "matchmaking", "trade ", "account change", "password change"
];

const L2_PATTERNS = [
  "edit ", "modify code", "refactor", "install ", "npm install", "pip install",
  "change setting", "move file", "rename", "migrate", "update config"
];

const L1_PATTERNS = [
  "open ", "search", "launch", "create file", "new file", "draft", "explain setting"
];

export function classifyTask(input: string): ClassifiedTask {
  const text = input.toLowerCase();

  for (const p of PROHIBITED) {
    if (text.includes(p)) {
      return {
        level: 4,
        label: LEVEL_LABELS[4],
        reason: `Matched prohibited pattern: "${p}"`,
        needsConfirmation: false
      };
    }
  }

  // Code fix playbook
  if (/error|traceback|exception|bug|fails|not working|crash/.test(text) && /code|python|javascript|typescript|next|react|node|app/.test(text)) {
    const level: ActionLevel = /delete|format/.test(text) ? 3 : 2;
    return {
      level,
      label: LEVEL_LABELS[level],
      reason: "Bug-fix request detected",
      playbook: "Fix my code",
      needsConfirmation: level === 3
    };
  }

  // Research playbook — fresh/time-sensitive info
  if (/price|news|latest|2025|2026|release|version|docs|travel|legal|compare|vs\.? |best /.test(text) || text.startsWith("search") || text.includes("find information")) {
    return { level: 0, label: LEVEL_LABELS[0], reason: "Research request", playbook: "Find information online", needsConfirmation: false };
  }

  // Build project playbook
  if (/build (me |an? )?app|build.*project|create.*project|scaffold/.test(text)) {
    return { level: 2, label: LEVEL_LABELS[2], reason: "Build request", playbook: "Build me a project", needsConfirmation: false };
  }

  // Game help
  if (/game|minecraft|fortnite|roblox|valorant|gta|fifa|settings.*graphics|fps|lag/.test(text)) {
    return { level: 1, label: LEVEL_LABELS[1], reason: "Game/app help", playbook: "Help me play", needsConfirmation: false };
  }

  for (const p of L3_PATTERNS) {
    if (text.includes(p.trim())) {
      return { level: 3, label: LEVEL_LABELS[3], reason: `High-impact keyword: "${p.trim()}"`, needsConfirmation: true };
    }
  }
  for (const p of L2_PATTERNS) {
    if (text.includes(p.trim())) {
      return { level: 2, label: LEVEL_LABELS[2], reason: `Material-change keyword: "${p.trim()}"`, needsConfirmation: false };
    }
  }
  for (const p of L1_PATTERNS) {
    if (text.includes(p.trim())) {
      return { level: 1, label: LEVEL_LABELS[1], reason: `Low-impact keyword: "${p.trim()}"`, needsConfirmation: false };
    }
  }

  return { level: 0, label: LEVEL_LABELS[0], reason: "General information request", needsConfirmation: false };
}

export interface AdelTeResponse {
  answer: string;
  level: ActionLevel;
  levelLabel: string;
  playbook?: string;
  confidence: "High" | "Medium" | "Low";
  nextStep?: string;
  needsConfirmation: boolean;
  sources?: string[];
}

function codeFixGuide(input: string): string {
  return `Root cause (possible): I can't run your repo from here, so treat this as a guided diagnosis — check the full error message and the file/line it points to first.

1. Reproduce: copy the exact error + the 20 lines around the failing call.
2. Isolate: comment out side-effects, add a minimal repro (single function / single route).
3. Likely culprits for "${truncate(input, 80)}":
   - missing await / promise not handled
   - wrong import path or version mismatch (check package.json)
   - env variable missing on Vercel (Settings → Environment Variables)
   - Next.js: using a server-only API in a client component or vice-versa
4. Smallest safe fix: change one thing, run \`npm run build\` locally, then re-test.
5. Add a regression check so it doesn't come back.

Paste your error log + relevant file and I'll pinpoint the exact lines to change.`;
}

function researchGuide(input: string): string {
  return `Bottom line: I run in local mode on this deployment (no live browsing wired up yet), so I can't pull fresh pages from here. Here's how to get a verified answer fast:

What I found from stable knowledge:
- Your question "${truncate(input, 120)}" is time/version-sensitive — it needs a current primary source.

Do this (2 min):
1. Search: \`${truncate(input, 60)} official docs 2026\` or \`site:docs.* ${truncate(input, 40)}\`
2. Open the official docs / announcement first, not blogs or snippets.
3. Cross-check one second source (changelog, GitHub releases, or reputable press).
4. Note date + version — prices, APIs, and game patches change fast.

If you paste the two sources (or deploy with a search API key), I'll compare them and give you a table + recommendation with confidence rating.`;
}

function buildGuide(): string {
  return `Plan (vertical slice first):
1. Define done: 1 page, 1 API route, deploys green on Vercel.
2. Structure: \`app/page.tsx\` (UI) → \`app/api/chat/route.ts\` (logic) → \`lib/adelte.ts\` (rules).
3. Build smallest working chat first (this app already does that), then add features incrementally.
4. Verify: \`npm run build\` must pass before \`git push\`.
5. Deploy: import the GitHub repo in Vercel, Framework = Next.js, no env vars needed for local mode.

This repo follows that exact layout — clone it and extend the API route to call your preferred model when ready.`;
}

function generalAnswer(input: string, task: ClassifiedTask): string {
  const lower = input.toLowerCase();

  if (/who are you|your name|adelte/.test(lower)) {
    return `I am AdelTe, the flagship online-first intelligent assistant created by AdelTe Industries.\n\nI help you think, research, browse, organize, create, troubleshoot, code, learn, operate your computer safely, and complete legitimate tasks quickly.\n\nOperating promise: Search intelligently. Analyze carefully. Act safely. Explain clearly. Verify honestly. Keep the user in control.`;
  }

  if (/^(hi|hello|hey|salut|bonjour)\b/.test(lower) && input.length < 30) {
    return `Hello — I'm AdelTe. Tell me your goal in one sentence and I'll either answer directly or give you a minimal safe plan.\n\nTry: "Fix Next.js build error", "Compare hosting prices", "Plan a PC cleanup", or "Explain this code: …".`;
  }

  if (/pc.*control|control.*pc|shutdown|restart pc|open app/.test(lower)) {
    return `Plan: PC control from a Vercel web app isn't directly possible (browsers can't run OS commands for safety). Safe path:\n\n1. Tell me the exact target: app name, file path, or setting.\n2. I'll give you the exact Windows command / PowerShell snippet to run locally.\n3. You run it, paste the output back, and I verify the result.\n\nExample: "open Chrome", "list startup apps", or "free disk space" — I'll return the one-liner + rollback note.`;
  }

  if (lower.includes("vercel") || lower.includes("deploy") || lower.includes("host")) {
    return `To host this app on Vercel:\n\n1. Push this folder to GitHub (see README deploy section).\n2. Go to vercel.com → Add New → Project → Import your repo.\n3. Framework Preset: Next.js. Build: \`npm run build\`. No env vars needed.\n4. Deploy → you get \`https://your-app.vercel.app\`.\n\nThis build is already Vercel-ready (Next 14, no server secrets required).`;
  }

  if (lower.includes("github") || lower.includes("push") || lower.includes("git")) {
    return `To push to GitHub:\n\n1. Create an empty repo on github.com (e.g. \`pccontroller\`, no README).\n2. Locally:\n   \`\`\`powershell\ngit remote add origin https://github.com/ADELTE-Boncoeur/pccontroller.git\ngit branch -M main\ngit push -u origin main\n   \`\`\`\n3. If push asks for login, use a Personal Access Token (Settings → Developer settings → Tokens) as the password — never paste it here.\n\nOnce pushed, import the repo in Vercel to go live.`;
  }

  return `Answer: I understood this as ${task.label.toLowerCase()} (${task.reason}).\n\nDetails:\n- Give me one concrete artifact to work with (error text, code snippet, goal + constraints, or two sources to compare) and I'll go deeper.\n- I stay within least privilege: view before modifying, reversible before destructive, and I ask before Level-3 actions.\n\nNext step: rephrase with your desired outcome + context (e.g. language, version, OS), and I'll produce the exact steps, commands, or code.`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function generateAdelTeReply(input: string): AdelTeResponse {
  const clean = input.trim();
  if (!clean) {
    return {
      answer: "Tell me your goal in one sentence and I'll help.",
      level: 0, levelLabel: LEVEL_LABELS[0], confidence: "High", needsConfirmation: false
    };
  }

  const task = classifyTask(clean);

  if (task.level === 4) {
    return {
      answer: `I can't help with that — it falls under ${task.label} (${task.reason}).\n\nBoundary: no credential theft, intrusion, malware, cheating/hacks, harassment, or surveillance help.\n\nSafe alternative: tell me the defensive or fair version (e.g. "secure my account", "remove malware", "improve aim legally", "fix lag") and I'll guide you step by step.`,
      level: 4, levelLabel: task.label, confidence: "High", needsConfirmation: false
    };
  }

  if (task.level === 3 && task.needsConfirmation) {
    return {
      answer: `This looks like ${task.label} (${task.reason}).\n\nBefore anything irreversible, confirm:\n- Exact target (path, account, device)\n- Reversible alternative (backup / recycle bin / restore point)\n\nTell me: "Target = X. I want permanent action, not backup." — or say "do the safe reversible version" and I'll give you that plan first.\n\nRollback path: I'll always include how to undo it.`,
      level: 3, levelLabel: task.label, playbook: task.playbook, confidence: "High", needsConfirmation: true
    };
  }

  let answer: string;
  let confidence: AdelTeResponse["confidence"] = "Medium";

  if (task.playbook === "Fix my code") {
    answer = codeFixGuide(clean);
    confidence = "Medium";
  } else if (task.playbook === "Find information online") {
    answer = researchGuide(clean);
    confidence = "Low";
  } else if (task.playbook === "Build me a project") {
    answer = buildGuide();
    confidence = "High";
  } else {
    answer = generalAnswer(clean, task);
    confidence = "Medium";
  }

  return {
    answer,
    level: task.level,
    levelLabel: task.label,
    playbook: task.playbook,
    confidence,
    needsConfirmation: task.needsConfirmation,
    nextStep: "Paste logs, code, or constraints for a precise next answer."
  };
}
