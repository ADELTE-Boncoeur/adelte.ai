"""
AdelTe Python brain — mirrors lib/adelte.ts so local + web stay consistent.
Local-first, no API key required. Implements L0-L4 classification,
safety boundaries, playbooks, and response patterns from AdelTe.md.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Optional
import re

LEVEL_LABELS = {
    0: "Level 0 — Information & drafting",
    1: "Level 1 — Reversible low-impact",
    2: "Level 2 — Material but reversible",
    3: "Level 3 — Sensitive / destructive / external",
    4: "Level 4 — Prohibited / unsafe",
}

PROHIBITED = [
    "steal password", "steal credentials", "account takeover", "break into",
    "ransomware", "malware", "keylogger", "phishing", "credential theft",
    "bypass authentication", "evade detection", "disable antivirus", "disable defender",
    "cheat", "aimbot", "wallhack", "injector", "trainer",
    "anti-cheat bypass", "ban evasion", "ddos", "denial of service",
    "harass", "stalk", "surveil", "spy on",
]

L3_PATTERNS = [
    "delete", "format", "wipe", "reset my pc", "factory reset", "registry",
    "admin", "root", "buy ", "purchase", "pay ", "send email", "publish",
    "transfer money", "alter cloud", "matchmaking", "trade ",
    "account change", "password change",
]

L2_PATTERNS = [
    "edit ", "modify code", "refactor", "install ", "npm install", "pip install",
    "change setting", "move file", "rename", "migrate", "update config",
]

L1_PATTERNS = [
    "open ", "search", "launch", "create file", "new file", "draft",
    "explain setting",
]


@dataclass
class ClassifiedTask:
    level: int
    label: str
    reason: str
    playbook: Optional[str] = None
    needs_confirmation: bool = False


def classify_task(text_in: str) -> ClassifiedTask:
    text = text_in.lower()

    for p in PROHIBITED:
        if p in text:
            return ClassifiedTask(4, LEVEL_LABELS[4], f'Matched prohibited pattern: "{p}"')

    if (re.search(r"error|traceback|exception|bug|fails|not working|crash", text)
            and re.search(r"code|python|javascript|typescript|next|react|node|app", text)):
        lvl = 3 if re.search(r"delete|format", text) else 2
        return ClassifiedTask(lvl, LEVEL_LABELS[lvl], "Bug-fix request detected",
                              playbook="Fix my code", needs_confirmation=(lvl == 3))

    if (re.search(r"price|news|latest|2025|2026|release|version|docs|travel|legal|compare|best ", text)
            or text.startswith("search") or "find information" in text):
        return ClassifiedTask(0, LEVEL_LABELS[0], "Research request",
                              playbook="Find information online")

    if re.search(r"build (me |an? )?app|build.*project|create.*project|scaffold", text):
        return ClassifiedTask(2, LEVEL_LABELS[2], "Build request",
                              playbook="Build me a project")

    if re.search(r"game|minecraft|fortnite|roblox|valorant|gta|fifa|settings.*graphics|fps|lag", text):
        return ClassifiedTask(1, LEVEL_LABELS[1], "Game/app help", playbook="Help me play")

    for p in L3_PATTERNS:
        if p.strip() in text:
            return ClassifiedTask(3, LEVEL_LABELS[3],
                                  f'High-impact keyword: "{p.strip()}"',
                                  needs_confirmation=True)
    for p in L2_PATTERNS:
        if p.strip() in text:
            return ClassifiedTask(2, LEVEL_LABELS[2],
                                  f'Material-change keyword: "{p.strip()}"')
    for p in L1_PATTERNS:
        if p.strip() in text:
            return ClassifiedTask(1, LEVEL_LABELS[1],
                                  f'Low-impact keyword: "{p.strip()}"')

    return ClassifiedTask(0, LEVEL_LABELS[0], "General information request")


def _truncate(s: str, n: int) -> str:
    return s if len(s) <= n else s[:n] + "…"


def _code_fix_guide(user_in: str) -> str:
    return (
        "Root cause (possible): I can't run your repo from here, so treat this as guided diagnosis — "
        "check the full error message and the file/line it points to first.\n\n"
        "1. Reproduce: copy the exact error + 20 lines around the failing call.\n"
        "2. Isolate: minimal repro (single function / single route).\n"
        f"3. Likely culprits for \"{_truncate(user_in, 80)}\":\n"
        "   - missing await / unhandled promise\n"
        "   - wrong import path or version mismatch (check package.json / requirements.txt)\n"
        "   - missing env var on Vercel (Settings → Environment Variables)\n"
        "   - Next.js: server-only API used in client component or vice-versa\n"
        "4. Smallest safe fix: change one thing, run `npm run build` / `pytest`, re-test.\n"
        "5. Add a regression check.\n\n"
        "Paste your error log + relevant file and I'll pinpoint exact lines."
    )


def _research_guide(user_in: str) -> str:
    return (
        "Bottom line: local mode has no live browsing wired up, so I can't pull fresh pages here.\n\n"
        f"Your question \"{_truncate(user_in, 120)}\" is time/version-sensitive — needs a primary source.\n\n"
        "Do this (2 min):\n"
        f"1. Search: `{_truncate(user_in, 60)} official docs 2026`\n"
        "2. Open official docs / announcement first, not blogs.\n"
        "3. Cross-check one second source (changelog, GitHub releases).\n"
        "4. Note date + version.\n\n"
        "Paste the two sources and I'll compare + recommend with confidence rating."
    )


def _general_answer(user_in: str, task: ClassifiedTask) -> str:
    low = user_in.lower()
    if re.search(r"who are you|your name|adelte", low):
        return ("I am AdelTe, the flagship online-first intelligent assistant created by AdelTe Industries.\n\n"
                "I help you think, research, browse, organize, create, troubleshoot, code, learn, "
                "operate your computer safely, and complete legitimate tasks quickly.\n\n"
                "Operating promise: Search intelligently. Analyze carefully. Act safely. "
                "Explain clearly. Verify honestly. Keep the user in control.")
    if re.match(r"^(hi|hello|hey|salut|bonjour)\b", low) and len(user_in) < 30:
        return ("Hello — I'm AdelTe. Tell me your goal in one sentence and I'll answer directly "
                "or give a minimal safe plan.\n\nTry: \"Fix Next.js build error\", "
                "\"Compare hosting prices\", \"Plan a PC cleanup\", or \"Explain this code: …\".")
    if re.search(r"pc.*control|control.*pc|shutdown|restart pc|open app", low):
        return ("Plan: a Vercel web app can't run OS commands (browsers block it for safety). Safe path:\n\n"
                "1. Tell me exact target: app name, file path, or setting.\n"
                "2. I'll give the exact Windows / PowerShell snippet (see python/pc_tools.py --dry-run).\n"
                "3. You run it locally, paste output back, I verify.\n\n"
                "Example: \"open Chrome\", \"list startup apps\", \"free disk space\".")
    if "vercel" in low or "deploy" in low or "host" in low:
        return ("To host this app on Vercel:\n\n"
                "1. Push this folder to GitHub.\n"
                "2. vercel.com → Add New → Project → Import repo.\n"
                "3. Framework: Next.js. Build: `npm run build`. No env vars needed.\n"
                "4. Deploy → https://your-app.vercel.app")
    if "github" in low or "push" in low or low.startswith("git"):
        return ("To push to GitHub:\n\n"
                "1. Create empty repo (e.g. `pccontroller`, no README).\n"
                "2. Locally:\n"
                "```powershell\ngit remote add origin https://github.com/ADELTE-Boncoeur/pccontroller.git\n"
                "git branch -M main\ngit push -u origin main\n```\n"
                "3. Use a Personal Access Token as password. Never paste it here.")
    return (f"Answer: I understood this as {task.label.lower()} ({task.reason}).\n\n"
            "Details:\n"
            "- Give me one concrete artifact (error text, code snippet, goal + constraints, "
            "or two sources to compare) and I'll go deeper.\n"
            "- Least privilege: view before modifying, reversible before destructive, "
            "ask before Level-3.\n\n"
            "Next step: rephrase with outcome + context (language, version, OS).")


def generate_reply(user_in: str) -> dict:
    clean = user_in.strip()
    if not clean:
        return {"answer": "Tell me your goal in one sentence and I'll help.",
                "level": 0, "level_label": LEVEL_LABELS[0],
                "confidence": "High", "needs_confirmation": False}

    task = classify_task(clean)

    if task.level == 4:
        return {"answer": (
            f"I can't help with that — {task.label} ({task.reason}).\n\n"
            "Boundary: no credential theft, intrusion, malware, cheating/hacks, harassment, or surveillance.\n\n"
            "Safe alternative: ask the defensive/fair version (e.g. \"secure my account\", "
            "\"remove malware\", \"fix lag\") and I'll guide you."),
            "level": 4, "level_label": task.label, "confidence": "High",
            "needs_confirmation": False}

    if task.level == 3 and task.needs_confirmation:
        return {"answer": (
            f"This looks like {task.label} ({task.reason}).\n\n"
            "Before anything irreversible, confirm:\n"
            "- Exact target (path, account, device)\n- Reversible alternative (backup / recycle bin / restore point)\n\n"
            'Tell me: "Target = X. I want permanent action." — or "do the safe reversible version".'),
            "level": 3, "level_label": task.label, "playbook": task.playbook,
            "confidence": "High", "needs_confirmation": True}

    if task.playbook == "Fix my code":
        answer, conf = _code_fix_guide(clean), "Medium"
    elif task.playbook == "Find information online":
        answer, conf = _research_guide(clean), "Low"
    elif task.playbook == "Build me a project":
        answer, conf = ("Plan (vertical slice first):\n1. Define done: 1 page, 1 API route, green Vercel build.\n"
                        "2. Structure: app/page.tsx → app/api/chat/route.ts → lib/adelte.ts (+ python/ locally).\n"
                        "3. Smallest working chat first, then extend.\n4. Verify: npm run build + pytest.\n"
                        "5. Deploy via GitHub import."), "High"
    else:
        answer, conf = _general_answer(clean, task), "Medium"

    return {"answer": answer, "level": task.level, "level_label": task.label,
            "playbook": task.playbook, "confidence": conf,
            "needs_confirmation": task.needs_confirmation}
