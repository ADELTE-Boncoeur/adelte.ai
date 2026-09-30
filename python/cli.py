"""AdelTe local CLI — terminal companion (local engine + online models, no key needed to start)."""
import sys
from adelte_brain import classify_task, generate_reply
from providers import ProviderError, available_models, generate_online_stream

BANNER = """AdelTe (local Python) — by AdelTe Industries
Type your goal. Commands:
  /model            list models + availability
  /model <id>       switch model (adelte-local = rules engine)
  /level <text>     classify only (L0-L4)
  /quit             exit
Safety: L0-L2 proceed, L3 asks first, L4 declined — even for online models.
Never paste passwords / OTP / private keys here.
"""


def _pick_default():
    for m in available_models():
        if m["available"] and m["id"] != "adelte-local":
            return m["id"]
    return "adelte-local"


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    print(BANNER)
    model_id = _pick_default()
    print(f"Model: {model_id} (type /model to change)\n")
    history: list = []
    while True:
        try:
            user_in = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nAdelTe: session closed. You stay in control. Goodbye.")
            return 0
        if not user_in:
            continue
        low = user_in.lower()
        if low in {"/quit", "/exit", "quit", "exit"}:
            print("AdelTe: session closed.")
            return 0
        if low == "/model" or low.startswith("/model "):
            arg = user_in[6:].strip()
            if not arg:
                for m in available_models():
                    mark = "●" if m["available"] else "○"
                    cur = "  <-- current" if m["id"] == model_id else ""
                    print(f"{mark} {m['id']} — {m['label']} ({m['hint']}){cur}")
                print()
                continue
            if any(m["id"] == arg for m in available_models()):
                model_id = arg
                print(f"Model: {model_id}\n")
            else:
                print(f"Unknown model: {arg} (see /model)\n")
            continue
        if low.startswith("/level "):
            t = classify_task(user_in[7:])
            print(f"AdelTe [{t.label}]: {t.reason}"
                  + (f" | playbook={t.playbook}" if t.playbook else ""))
            continue

        # Safety gate runs locally first, whatever the model.
        task = classify_task(user_in)
        if task.level == 4 or model_id == "adelte-local":
            r = generate_reply(user_in)
            head = f"AdelTe [{r['level_label']} | confidence {r['confidence']}]"
            if r.get("playbook"):
                head += f" | {r['playbook']}"
            print(head + " | AdelTe Local")
            print(r["answer"] + "\n")
        else:
            try:
                print(f"AdelTe [{task.label}] | {model_id}")
                parts = []
                for tok in generate_online_stream(model_id, history, user_in):
                    print(tok, end="", flush=True)
                    parts.append(tok)
                print("\n")
                text = "".join(parts)
                if not text.strip():
                    raise ProviderError("Provider returned an empty reply")
                history = (history + [{"role": "user", "content": user_in},
                                      {"role": "assistant", "content": text}])[-10:]
                continue
            except ProviderError as e:
                r = generate_reply(user_in)
                print(f"AdelTe [{r['level_label']}] | AdelTe Local (fallback — online failed: {e})")
                print(r["answer"] + "\n")
        history = (history + [{"role": "user", "content": user_in}])[-10:]


if __name__ == "__main__":
    raise SystemExit(main())
