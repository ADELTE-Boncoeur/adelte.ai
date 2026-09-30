import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pytest
from providers import MODELS, ProviderError, available_models, generate_online
from providers import attachment_label, build_context_message, extract_anthropic, extract_google
from providers import extract_openai, generate_online_stream, local_file_note, sanitize_files


def test_catalog_has_all_providers():
    assert len(MODELS) >= 10
    providers = {m["provider"] for m in MODELS}
    assert {"local", "openai", "anthropic", "google", "deepseek", "mistral"} <= providers


def test_offline_env_only_local_available():
    assert all(m["available"] == (m["provider"] == "local") for m in available_models({}))


def test_key_unlocks_provider_models():
    got = available_models({"OPENAI_API_KEY": "x"})
    assert all(m["available"] for m in got if m["provider"] == "openai")
    assert not any(m["available"] for m in got if m["provider"] == "anthropic")


def test_unknown_model_rejected_without_network():
    with pytest.raises(ProviderError, match="Unknown model"):
        generate_online("nope", [], "hi", env={})


def test_missing_key_rejected_without_network():
    with pytest.raises(ProviderError, match="Missing OPENAI_API_KEY"):
        generate_online("gpt-4o", [], "hi", env={})


def test_local_model_uses_rules_engine():
    with pytest.raises(ProviderError, match="rules engine"):
        generate_online("adelte-local", [], "hi", env={})


def test_openai_extractor():
    assert extract_openai({"choices": [{"delta": {"content": "Hi"}}]}) == "Hi"
    assert extract_openai({"choices": [{"delta": {}}]}) is None
    assert extract_openai({"choices": []}) is None
    assert extract_openai({}) is None


def test_anthropic_extractor():
    assert extract_anthropic("content_block_delta", {"delta": {"text": "Hi"}}) == "Hi"
    assert extract_anthropic("message_start", {"message": {}}) is None
    assert extract_anthropic("content_block_delta", {"delta": {}}) is None


def test_google_extractor():
    data = {"candidates": [{"content": {"parts": [{"text": "A"}, {"text": "B"}]}}]}
    assert extract_google(data) == "AB"
    assert extract_google({"candidates": []}) is None
    assert extract_google({}) is None


def test_stream_unknown_model_rejected_immediately():
    with pytest.raises(ProviderError, match="Unknown model"):
        generate_online_stream("nope", [], "hi", env={})


def test_stream_missing_key_rejected_on_iteration():
    gen = generate_online_stream("gpt-4o", [], "hi", env={})
    with pytest.raises(ProviderError, match="Missing OPENAI_API_KEY"):
        list(gen)


def test_stream_local_rejected_on_iteration():
    gen = generate_online_stream("adelte-local", [], "hi", env={})
    with pytest.raises(ProviderError, match="rules engine"):
        list(gen)


def test_sanitize_files_basic():
    files, notes = sanitize_files([{"name": "a.py", "text": "print(1)"}])
    assert len(files) == 1 and notes == []


def test_sanitize_files_skips_blank_and_limits():
    from providers import MAX_FILES, MAX_CHARS_PER_FILE
    files, _ = sanitize_files([{"name": "x", "text": "   "}, {"name": "b.log", "text": "ok"}])
    assert [f["name"] for f in files] == ["b.log"]
    files, notes = sanitize_files([{"name": "big.txt", "text": "x" * (MAX_CHARS_PER_FILE + 50)}])
    assert len(files[0]["text"]) == MAX_CHARS_PER_FILE
    assert any("truncated" in n for n in notes)
    many = [{"name": f"f{i}.txt", "text": "data"} for i in range(MAX_FILES + 2)]
    files, notes = sanitize_files(many)
    assert len(files) == MAX_FILES
    assert any("first" in n for n in notes)


def test_build_context_message():
    ctx = build_context_message("fix this", [{"name": "a.py", "text": "print(1)"}])
    assert ctx.startswith("fix this") and '<file name="a.py">' in ctx
    assert build_context_message("hi", []) == "hi"
    assert attachment_label([]) == ""
    assert attachment_label([{"name": "a.py", "text": ""}]) == " [attached: a.py]"
    assert "a.py" in local_file_note([{"name": "a.py", "text": ""}])
    assert local_file_note([]) == ""
