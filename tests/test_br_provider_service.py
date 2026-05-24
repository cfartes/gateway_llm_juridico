from app.core.config import settings
from app.services import br_data_provider_service as provider


def test_receitaws_mode_sends_token_and_maps_status(monkeypatch):
    captured: dict[str, object] = {}

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"status": "OK", "situacao": "ATIVA"}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            _ = args, kwargs

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            _ = exc_type, exc, tb
            return False

        def get(self, url, headers=None, params=None):
            captured["url"] = url
            captured["headers"] = headers or {}
            captured["params"] = params or {}
            return FakeResponse()

    monkeypatch.setattr(provider.httpx, "Client", FakeClient)
    monkeypatch.setattr(settings, "br_cnpj_provider_mode", "receitaws", raising=False)
    monkeypatch.setattr(settings, "br_cnpj_provider_timeout_seconds", 3.0, raising=False)
    monkeypatch.setattr(settings, "br_cnpj_provider_token", "tok-123", raising=False)
    monkeypatch.setattr(settings, "br_cnpj_provider_base_url", "", raising=False)

    result = provider.fetch_cnpj_signals("27865757000102")

    assert result.source == "receitaws"
    assert result.registration_status == "active"
    assert captured["url"] == "https://www.receitaws.com.br/v1/cnpj/27865757000102"
    assert captured["params"] == {"token": "tok-123"}
    assert captured["headers"]["x_api_token"] == "tok-123"

