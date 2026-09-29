# AdelTe Python companion — strong local AI side

Web UI (Vercel) = TypeScript/Next.js. **Python is the strong local side**: PC-safe tools,
terminal brain, and tests. Python is NOT required for Vercel hosting — it runs on your PC.

## Why both?
- **Vercel hosting needs JS/TS**: Vercel builds `app/` with Node. Python can't replace that.
- **Big/strong local AI needs Python**: OS inspection, scripts, data work, future ML
  (`pc_tools.py`, `cli.py`, `adelte_brain.py`). Same L0–L4 safety as the web engine.

## Use
```powershell
# chat in terminal (no key needed)
python python\cli.py

# classify only
# /level delete all my files

# safe PC tools — dry-run by default, nothing executes
python python\pc_tools.py --sysinfo
python python\pc_tools.py --disk-cmd
python python\pc_tools.py --list-dir "$env:USERPROFILE\Desktop"
python python\pc_tools.py --list-dir "$env:USERPROFILE\Desktop" --confirm

# tests (needs pytest: pip install pytest)
python -m pytest python\tests -q
```

## Safety
- Never paste passwords / OTP / keys.
- L3 (delete/format/admin/registry/purchases) always asks first.
- L4 (malware, intrusion, cheats, harassment) is declined with a safe alternative.
