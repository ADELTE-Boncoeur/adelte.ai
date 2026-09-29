"""
AdelTe PC tools — SAFE, local-only, dry-run by default.
Level policy: info (L0/L1) runs locally; material (L2) previews first;
sensitive/destructive (L3) requires --confirm + explicit target.
Nothing phones home. Nothing runs on Vercel — this is for your own PC only.
"""
from __future__ import annotations
import argparse
import platform
import shutil
import os
import subprocess
import sys

def sysinfo() -> str:
    total, used, free = shutil.disk_usage(os.path.expanduser("~"))
    return (
        f"OS: {platform.system()} {platform.release()} ({platform.version()})\n"
        f"Machine: {platform.machine()} | CPU: {os.cpu_count()} cores\n"
        f"Disk (home drive): total={total//2**30}GB used={used//2**30}GB free={free//2**30}GB"
    )

def disk_command() -> str:
    if platform.system() == "Windows":
        return "Get-PSDrive -PSProvider FileSystem | Format-Table Name, Used, Free"
    return "df -h"

def run_safe_preview(cmd: list[str]) -> str:
    return "DRY-RUN (nothing executed). Would run:\n  " + " ".join(cmd) + \
        "\nRe-run with --confirm to execute. Scope limited to your own PC."

def run_confirmed(cmd: list[str]) -> str:
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        txt = (out.stdout or "") + (("\n" + out.stderr) if out.stderr else "")
        return txt.strip()[:4000] or f"(exit {out.returncode}, no output)"
    except Exception as e:
        return f"Failed: {e}"

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="AdelTe safe PC tools (dry-run by default)")
    ap.add_argument("--sysinfo", action="store_true", help="Show OS/CPU/disk (L0, safe)")
    ap.add_argument("--disk-cmd", action="store_true", help="Print disk-space command for your OS")
    ap.add_argument("--list-dir", metavar="PATH", help="List a directory (L1, safe preview first)")
    ap.add_argument("--confirm", action="store_true", help="Allow execution (required for L2/L3)")
    args = ap.parse_args(argv)

    if args.sysinfo:
        print(sysinfo())
        return 0
    if args.disk_cmd:
        print(disk_command())
        return 0
    if args.list_dir:
        target = os.path.abspath(os.path.expanduser(args.list_dir))
        if not os.path.isdir(target):
            print(f"Not a directory: {target}")
            return 2
        if not args.confirm:
            print(f"DRY-RUN: would list {target} (top 30 entries). Re-run with --confirm.")
            return 0
        try:
            entries = sorted(os.listdir(target))[:30]
            print(f"{target} (showing {len(entries)}):")
            for e in entries:
                print(" - " + e)
            return 0
        except Exception as e:
            print(f"Failed: {e}")
            return 1
    ap.print_help()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
