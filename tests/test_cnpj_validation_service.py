from app.schemas.cnpj_validation import CNPJLookupResponse
from app.services import cnpj_validation_service as service


def test_evaluate_due_diligence_with_provider_override(monkeypatch):
    class FakeSignals:
        registration_status = "active"
        debt_level = "none"
        lawsuit_level = "below_average"
        sintegra_enabled = True
        source = "custom"

    monkeypatch.setattr(service, "fetch_cnpj_signals", lambda _cnpj: FakeSignals())

    score, criteria, recommendation, registration_status = service.evaluate_cnpj_due_diligence("27865757000102")

    assert score == 100.0
    assert registration_status == "active"
    assert recommendation == "Recomendado para Assinatura"
    assert criteria
    assert all("Fonte: custom." in item.note for item in criteria)


def test_bulk_update_distribution_counts(monkeypatch):
    def fake_eval(cnpj: str):
        if cnpj == "27865757000102":
            return 85.0, [], "Recomendado para Assinatura", "active"
        return 45.0, [], "Desistir do Contrato", "inactive"

    monkeypatch.setattr(service, "evaluate_cnpj_due_diligence", fake_eval)

    items, distribution, average = service.evaluate_bulk_cnpjs(
        ["27865757000102", "19131243000197", "00000000000000"]
    )

    assert len(items) == 3
    assert distribution.active == 1
    assert distribution.inactive == 2
    assert distribution.recommended == 1
    assert distribution.desist == 2
    assert average == 65.0


def test_lookup_response_shape_for_invalid_cnpj():
    result = CNPJLookupResponse(
        cnpj="00000000000000",
        cnpj_valid=False,
        summary="CNPJ invalido",
    )
    assert result.cnpj_valid is False
    assert result.score is None
