# Arquitetura - Nexus Gateway LLM Shield

## Visão geral

```text
Cliente Web / API Consumer
        |
        v
FastAPI Gateway (JWT/API Token + RBAC + Rate Limit)
        |
        v
Upload / URL Ingestion
        |
        v
Sanitização + File Validation + Macro/ZIP Guard
        |
        v
Text Extraction (PDF/DOCX/PPTX/XLSX/CSV/TXT/HTML/MD)
        |
        v
OCR (PaddleOCR)
        |
        v
Heurística + LLM Hybrid Classifier (OpenAI/Ollama)
        |
        v
Threat Scoring + Technical Report
        |
        v
PostgreSQL (multi-tenant) + Audit Logs + Export Sanitizado
```

## Isolamento multi-tenant

- Todas as entidades críticas carregam `tenant_id`
- Contexto de autorização resolve tenant via JWT ou API Token
- Queries de leitura/escrita filtram tenant explicitamente

## Segurança

- JWT para sessão de usuário
- API Bearer token dedicado para integrações B2B
- RBAC por papéis `admin`, `analyst`, `viewer`
- Rate limit por tenant (Redis)
- Log de auditoria por ação e origem
- `result_json` criptografado em repouso (Fernet)

## Pipeline de análise

- `sanitize`: normalização e remoção de padrões sensíveis
- `extract_text`: parsers por formato
- `ocr`: extração de texto em imagens/PDF escaneado
- `heuristics`: padrões de prompt injection, exfiltração, scripts, manipulação de contexto
- `llm`: classificação semântica híbrida (OpenAI/Ollama/fallback)
- `score`: cálculo de score e risk level
- `report`: relatório final JSON para API/app

## Assíncrono

- `scan-sync`: retorna análise imediatamente
- `scan-async`: cria job e executa no Celery worker
- `GET /scans/{id}`: consulta status/resultado

## Frontend

- Next.js + React + Tailwind
- Dashboard com upload, score, evidências, histórico e gestão de API token
- Exportação de sanitização por scan

