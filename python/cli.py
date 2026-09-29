"""AdelTe local CLI — strong-AI terminal companion (no API key needed)."""
import sys
from adelte_brain import generate_reply

BANNER = """AdelTe (local Python) — by AdelTe Industries
Type your goal. Commands: /level <text> (classify only), /quit
Safety: L0-L2 proceed, L3 asks first, L4 declined.
Never paste passwords / OTP / private keys here.
"""

def main() -> int:
    print(BANNER)
    while True:
        try:
            user_in = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nAdelTe: session closed. You stay in control. Goodbye.")
            return 0
        if not user_in:
            continue
        if user_in.lower() in {"/quit", "/exit", "quit", "exit"}:
            print("AdelTe: session closed.")
            return 0
        if user_in.lower().startswith("/level "):
            from adelte_brain import classify_task
            t = classify_task(user_in[7:])
            print(f"AdelTe [{t.label}]: {t.reason}"
                  + (f" | playbook={t.playbook}" if t.playbook else ""))
            continue
        r = generate_reply(user_in)
        head = f"AdelTe [{r['level_label']} | confidence {r['confidence']}]"
        if r.get("playbook"):
            head += f" | {r['playbook']}"
        print(head)
        print(r["answer"])
        print()

if __name__ == "__main__":
    raise SystemExit(main())
