"""AdelTe local CLI — terminal companion (local engine + online models, no key needed to start)."""
import os
import sys
from adelte_brain import classify_task, generate_reply
from providers import ProviderError, attachment_label, available_models, generate_online_stream
from providers import local_file_note, sanitize_files

BANNER = """AdelTe (local Python) — by AdelTe Industries
Type your goal. Commands:
  /model            list models + availability
  /model <id>       switch model (adelte-local = rules engine)
  /attach <path>    attach a text/code file as context (max 5)
  /files            list attached files
  /clear            drop attached files
  /level <text>     classify only (L0-L4)
  /quit             exit
Safety: L0-L2 proceed, L3 asks first, L4 declined — even for online models.
Never paste passwords / OTP / private keys here — including in attached files.
"""


def _pick_default():
    for m in available_models():
        if m["available"] and m["id"] != "adelte-local":
            return m["id"]
    return "adelte-local"


def _read_attach(path, attached):
    from providers import MAX_FILES, MAX_CHARS_PER_FILE
    if len(attached) >= MAX_FILES:
        return None, f"Already holding {MAX_FILES} files — /clear first."
    target = os.path.abspath(os.path.expanduser(path))
    if not os.path.isfile(target):
        return None, f"Not a file: {target}"
    try:
        with open(target, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read(MAX_CHARS_PER_FILE + 1)
    except Exception as e:
        return None, f"Could not read: {e}"
    return {"name": os.path.basename(target), "text": text}, ""


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
    attached: list = []
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
        if low.startswith("/attach "):
            item, err = _read_attach(user_in[8:].strip(), attached)
            if err:
                print(err + "\n")
                continue
            files, notes = sanitize_files(attached + [item])
            attached = files
            print(f"Attached: {item['name']} ({len(item['text'])} chars)")
            for n in notes:
                print(f"({n})")
            print()
            continue
        if low == "/files":
            if not attached:
                print("No files attached.\n")
            else:
                for f in attached:
                    print(f" - {f['name']} ({len(f['text'])} chars)")
                print()
            continue
        if low == "/clear":
            attached = []
            print("Attachments cleared.\n")
            continue

        # Safety gate runs locally first, whatever the model — on the message only.
        task = classify_task(user_in)
        files, notes = sanitize_files(attached)
        attached = []
        if task.level == 4 or model_id == "adelte-local":
            r = generate_reply(user_in)
            head = f"AdelTe [{r['level_label']} | confidence {r['confidence']}]"
            if r.get("playbook"):
                head += f" | {r['playbook']}"
            print(head + " | AdelTe Local" + attachment_label(files))
            print(r["answer"] + local_file_note(files) + "\n")
        else:
            try:
                print(f"AdelTe [{task.label}] | {model_id}" + attachment_label(files))
                parts = []
                for tok in generate_online_stream(model_id, history, user_in, files=files):
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
                print(r["answer"] + local_file_note(files) + "\n")
        history = (history + [{"role": "user", "content": user_in}])[-10:]


if __name__ == "__main__":
    raise SystemExit(main())
