import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import pytest
from providers import MODELS, ProviderError, available_models, generate_online


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
