# AdelTe Python companion — strong local AI side

Web UI (Vercel) = TypeScript/Next.js. **Python is the strong local side**: PC-safe tools,
terminal brain, and tests. Python is NOT required for Vercel hosting — it runs on your PC.

## Why both?
- **Vercel hosting needs JS/TS**: Vercel builds `app/` with Node. Python can't replace that.
- **Big/strong local AI needs Python**: OS inspection, scripts, data work, future ML
  (`pc_tools.py`, `cli.py`, `adelte_brain.py`). Same L0–L4 safety as the web engine.

## Use
```powershell
# chat in terminal (local engine; auto-uses an online model if its key is set)
python python\cli.py

# inside the CLI: /model (list), /model gpt-4o-mini (switch), /level <text> (classify)
```

## Online models (same 10 as the web app)
Set keys in your shell — never paste them in chat, never commit them:
```powershell
$env:OPENAI_API_KEY="..."
$env:ANTHROPIC_API_KEY="..."
$env:GOOGLE_API_KEY="..."
$env:DEEPSEEK_API_KEY="..."
$env:MISTRAL_API_KEY="..."
```
Without keys everything still works via AdelTe Local. Online failures fall back
to local with the error shown. The L4/L3 safety gate runs locally first, always.

## Safe PC tools (dry-run by default, nothing executes)
```powershell
python python\pc_tools.py --sysinfo
python python\pc_tools.py --disk-cmd
python python\pc_tools.py --list-dir "$env:USERPROFILE\Desktop"
python python\pc_tools.py --list-dir "$env:USERPROFILE\Desktop" --confirm

# tests
python -m pytest python\tests -q
```

## Safety
- Never paste passwords / OTP / keys.
- L3 (delete/format/admin/registry/purchases) always asks first.
- L4 (malware, intrusion, cheats, harassment) is declined with a safe alternative.
