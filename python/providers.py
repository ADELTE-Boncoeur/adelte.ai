"""
AdelTe online providers — stdlib only (urllib), no third-party installs.
Mirrors lib/models.ts so the terminal and the web app offer the same models.

Keys come from environment variables ONLY. Never paste keys into the chat.
Set them in your shell ($env:OPENAI_API_KEY="..." in PowerShell) or a local
.env file that you never commit.
"""
from __future__ import annotations
import json
import os
import urllib.error
import urllib.request

ADELTE_SYSTEM = "\n".join([
    "You are AdelTe, the flagship online-first intelligent assistant created by AdelTe Industries.",
    "Mission: the most useful correct result in the least unnecessary time, while protecting the user's data, device, accounts, money, privacy, autonomy, and trust.",
    "Be fast, calm, direct, capable, professional. Answer first, then only the key reasoning or steps.",
    "Be honest about certainty (Confirmed / Likely / Possible / Unknown). Never invent sources, versions, prices, or test results.",
    "Never claim you browsed, opened, downloaded, installed, ran, or fixed anything unless the conversation shows it actually happened.",
    "Refuse credential theft, intrusion, malware, cheating/hacks, harassment, and surveillance; briefly state the boundary and offer a safe alternative.",
    "For destructive, financial, account, or system-admin actions, explain consequences and ask for explicit confirmation first.",
    "Never ask for passwords, OTP codes, recovery codes, private keys, or tokens.",
    "Use markdown with short sections and code blocks where it helps. Match the user's language.",
])

MODELS = [
    {"id": "adelte-local", "label": "AdelTe Local", "provider": "local", "env_key": None,
     "hint": "Always on — rules engine, no key"},
    {"id": "gpt-4o-mini", "label": "GPT-4o mini (OpenAI)", "provider": "openai", "env_key": "OPENAI_API_KEY",
     "hint": "Fast + cheap"},
    {"id": "gpt-4o", "label": "GPT-4o (OpenAI)", "provider": "openai", "env_key": "OPENAI_API_KEY",
     "hint": "Flagship OpenAI"},
    {"id": "claude-3-5-haiku-20241022", "label": "Claude Haiku (Anthropic)", "provider": "anthropic",
     "env_key": "ANTHROPIC_API_KEY", "hint": "Fast + cheap"},
    {"id": "claude-3-5-sonnet-20241022", "label": "Claude Sonnet (Anthropic)", "provider": "anthropic",
     "env_key": "ANTHROPIC_API_KEY", "hint": "Flagship Anthropic"},
    {"id": "gemini-2.0-flash", "label": "Gemini Flash (Google)", "provider": "google", "env_key": "GOOGLE_API_KEY",
     "hint": "Fast + generous free tier"},
    {"id": "gemini-1.5-pro", "label": "Gemini Pro (Google)", "provider": "google", "env_key": "GOOGLE_API_KEY",
     "hint": "Long context"},
    {"id": "deepseek-chat", "label": "DeepSeek Chat", "provider": "deepseek", "env_key": "DEEPSEEK_API_KEY",
     "hint": "Strong + very cheap"},
    {"id": "mistral-small-latest", "label": "Mistral Small", "provider": "mistral", "env_key": "MISTRAL_API_KEY",
     "hint": "Fast European model"},
    {"id": "mistral-large-latest", "label": "Mistral Large", "provider": "mistral", "env_key": "MISTRAL_API_KEY",
     "hint": "Flagship Mistral"},
]


class ProviderError(Exception):
    """Raised for unknown models, missing keys, or failed provider calls."""


MAX_FILES = 5
MAX_CHARS_PER_FILE = 20000
MAX_TOTAL_CHARS = 60000


def _clean_name(name):
    import re
    cleaned = re.sub(r"[^\w.\-() ]", "_", name or "file")[:80]
    return cleaned or "file"


def sanitize_files(items):
    """Normalize + enforce caps. Returns (files, notes)."""
    notes = []
    if not isinstance(items, list):
        return [], notes
    files = []
    total = 0
    for item in items:
        if len(files) >= MAX_FILES:
            notes.append(f"Only the first {MAX_FILES} files were kept.")
            break
        if not isinstance(item, dict):
            continue
        name = _clean_name(item.get("name") if isinstance(item.get("name"), str) else "file")
        text = item.get("text") if isinstance(item.get("text"), str) else ""
        if not text.strip():
            continue
        if len(text) > MAX_CHARS_PER_FILE:
            text = text[:MAX_CHARS_PER_FILE]
            notes.append(f"{name} was truncated to {MAX_CHARS_PER_FILE} chars.")
        if total + len(text) > MAX_TOTAL_CHARS:
            notes.append(f"Total attachment budget ({MAX_TOTAL_CHARS} chars) reached — remaining files skipped.")
            break
        total += len(text)
        files.append({"name": name, "text": text})
    return files, notes


def build_context_message(message, files):
    """User text + fenced file blocks for provider context."""
    if not files:
        return message
    blocks = [f"<file name=\"{f['name']}\">\n{f['text']}\n</file>" for f in files]
    return f"{message}\n\nAttached files for context:\n" + "\n".join(blocks)


def attachment_label(files):
    if not files:
        return ""
    return " [attached: " + ", ".join(f["name"] for f in files) + "]"


def local_file_note(files):
    if not files:
        return ""
    names = ", ".join(f["name"] for f in files)
    return (f"\n\n[Note: {len(files)} file(s) attached ({names}). "
            "The local engine can't deeply analyze file content — "
            "switch to an online model for file-aware answers.]")


def available_models(env=None):
    env = os.environ if env is None else env
    out = []
    for m in MODELS:
        if m["provider"] == "local":
            available = True
        else:
            available = bool((env.get(m["env_key"]) or "").strip())
        out.append({**m, "available": available})
    return out


def _post_json(url, payload, headers, timeout=90):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode("utf-8")[:300]
        except Exception:
            detail = ""
        raise ProviderError(f"Provider HTTP {e.code}: {detail}")
    except Exception as e:
        raise ProviderError(f"Provider request failed: {e}")


def _openai_compatible(base, key, model_id, system, messages):
    body = {
        "model": model_id,
        "messages": [{"role": "system", "content": system}] + messages,
        "temperature": 0.7,
        "max_tokens": 1500,
    }
    data = _post_json(base + "/chat/completions", body,
                      {"Content-Type": "application/json", "Authorization": "Bearer " + key})
    try:
        text = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        text = ""
    if not (text or "").strip():
        raise ProviderError("Provider returned an empty reply")
    return text


def _anthropic(key, model_id, system, messages):
    body = {"model": model_id, "max_tokens": 1500, "system": system, "messages": messages}
    data = _post_json("https://api.anthropic.com/v1/messages", body,
                      {"Content-Type": "application/json", "x-api-key": key,
                       "anthropic-version": "2023-06-01"})
    parts = [b.get("text", "") for b in (data.get("content") or []) if b.get("type") == "text"]
    text = "\n".join(parts)
    if not text.strip():
        raise ProviderError("Provider returned an empty reply")
    return text


def _google(key, model_id, system, messages):
    from urllib.parse import quote
    url = ("https://generativelanguage.googleapis.com/v1beta/models/"
           + model_id + ":generateContent?key=" + quote(key, safe=""))
    contents = [{"role": "model" if m["role"] == "assistant" else "user",
                 "parts": [{"text": m["content"]}]} for m in messages]
    body = {"system_instruction": {"parts": [{"text": system}]}, "contents": contents}
    data = _post_json(url, body, {"Content-Type": "application/json"})
    try:
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts)
    except (KeyError, IndexError, TypeError):
        text = ""
    if not text.strip():
        raise ProviderError("Provider returned an empty reply")
    return text


def generate_online(model_id, history, message, env=None, files=None):
    """Call an online model. history = list of {"role": "user"/"assistant", "content": str}.

    files = list of {"name": str, "text": str} sent as context blocks.
    Raises ProviderError for unknown models, missing keys, or failed calls.
    """
    env = os.environ if env is None else env
    model = next((m for m in MODELS if m["id"] == model_id), None)
    if model is None:
        raise ProviderError(f"Unknown model: {model_id}")
    if model["provider"] == "local":
        raise ProviderError("adelte-local uses the built-in rules engine, not a provider")
    key = (env.get(model["env_key"]) or "").strip()
    if not key:
        raise ProviderError(
            f"Missing {model['env_key']} — set it in your shell "
            f"($env:{model['env_key']}=\"...\" in PowerShell) and retry. Never paste keys in chat.")
    content = build_context_message(message, files or [])
    messages = list(history[-10:]) + [{"role": "user", "content": content}]
    provider = model["provider"]
    if provider == "openai":
        return _openai_compatible("https://api.openai.com/v1", key, model_id, ADELTE_SYSTEM, messages)
    if provider == "deepseek":
        return _openai_compatible("https://api.deepseek.com", key, model_id, ADELTE_SYSTEM, messages)
    if provider == "mistral":
        return _openai_compatible("https://api.mistral.ai/v1", key, model_id, ADELTE_SYSTEM, messages)
    if provider == "anthropic":
        return _anthropic(key, model_id, ADELTE_SYSTEM, messages)
    return _google(key, model_id, ADELTE_SYSTEM, messages)


# ---- Streaming (SSE) ----

def extract_openai(data):
    """Pure: OpenAI-compatible delta chunk -> text or None."""
    try:
        delta = data["choices"][0].get("delta") or {}
        text = delta.get("content")
        if isinstance(text, str):
            return text
        msg = data["choices"][0].get("message") or {}
        text = msg.get("content")
        return text if isinstance(text, str) else None
    except (KeyError, IndexError, TypeError, AttributeError):
        return None


def extract_anthropic(event, data):
    """Pure: only content_block_delta carries text."""
    if event != "content_block_delta":
        return None
    try:
        text = data["delta"].get("text")
        return text if isinstance(text, str) else None
    except (KeyError, TypeError, AttributeError):
        return None


def extract_google(data):
    """Pure: candidates[0].content.parts[].text joined."""
    try:
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts)
        return text or None
    except (KeyError, IndexError, TypeError, AttributeError):
        return None


def _stream_sse(url, payload, headers, extract, timeout=90):
    """Yield text tokens from an SSE response. Raises ProviderError on failure."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        res = urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        try:
            detail = e.read().decode("utf-8")[:300]
        except Exception:
            detail = ""
        raise ProviderError(f"Provider HTTP {e.code}: {detail}")
    except Exception as e:
        raise ProviderError(f"Provider request failed: {e}")
    buf = ""
    event = ""
    with res:
        while True:
            try:
                chunk = res.read(4096)
            except Exception as e:
                raise ProviderError(f"Provider stream interrupted: {e}")
            if chunk:
                buf += chunk.decode("utf-8", errors="replace")
            lines = buf.split("\n")
            buf = lines.pop()
            for line in lines:
                line = line.rstrip("\r")
                if line == "":
                    event = ""
                    continue
                if line.startswith(":"):
                    continue
                if line.startswith("event:"):
                    event = line[6:].strip()
                    if event in ("message_stop", "error", "message_complete"):
                        return
                    continue
                if not line.startswith("data:"):
                    continue
                payload_s = line[5:].strip()
                if payload_s == "[DONE]":
                    return
                try:
                    obj = json.loads(payload_s)
                except ValueError:
                    continue
                token = extract(event, obj)
                if token:
                    yield token
            if not chunk:
                break


def generate_online_stream(model_id, history, message, env=None, files=None):
    """Yield reply tokens from an online model.

    Same validation as generate_online: unknown models raise immediately;
    local models and missing keys raise ProviderError on first iteration.
    history = list of {"role": "user"/"assistant", "content": str}.
    """
    env = os.environ if env is None else env
    model = next((m for m in MODELS if m["id"] == model_id), None)
    if model is None:
        raise ProviderError(f"Unknown model: {model_id}")
    return _generate_online_stream_validated(model, history, message, env, files)


def _generate_online_stream_validated(model, history, message, env, files=None):
    if model["provider"] == "local":
        raise ProviderError("adelte-local uses the built-in rules engine, not a provider")
    key = (env.get(model["env_key"]) or "").strip()
    if not key:
        raise ProviderError(
            f"Missing {model['env_key']} — set it in your shell "
            f"($env:{model['env_key']}=\"...\" in PowerShell) and retry. Never paste keys in chat.")
    content = build_context_message(message, files or [])
    messages = list(history[-10:]) + [{"role": "user", "content": content}]
    provider = model["provider"]
    if provider in ("openai", "deepseek", "mistral"):
        base = {"openai": "https://api.openai.com/v1",
                "deepseek": "https://api.deepseek.com",
                "mistral": "https://api.mistral.ai/v1"}[provider]
        body = {"model": model["id"],
                "messages": [{"role": "system", "content": ADELTE_SYSTEM}] + messages,
                "temperature": 0.7, "max_tokens": 1500, "stream": True}
        headers = {"Content-Type": "application/json", "Authorization": "Bearer " + key}
        yield from _stream_sse(base + "/chat/completions", body, headers, lambda _e, d: extract_openai(d))
        return
    if provider == "anthropic":
        body = {"model": model["id"], "max_tokens": 1500, "system": ADELTE_SYSTEM,
                "messages": messages, "stream": True}
        headers = {"Content-Type": "application/json", "x-api-key": key,
                   "anthropic-version": "2023-06-01", "Accept": "text/event-stream"}
        yield from _stream_sse("https://api.anthropic.com/v1/messages", body, headers, extract_anthropic)
        return
    from urllib.parse import quote
    url = ("https://generativelanguage.googleapis.com/v1beta/models/"
           + model["id"] + ":generateContent?key=" + quote(key, safe="") + "&alt=sse")
    contents = [{"role": "model" if m["role"] == "assistant" else "user",
                 "parts": [{"text": m["content"]}]} for m in messages]
    body = {"system_instruction": {"parts": [{"text": ADELTE_SYSTEM}]}, "contents": contents}
    yield from _stream_sse(url, body, {"Content-Type": "application/json"},
                           lambda _e, d: extract_google(d))
