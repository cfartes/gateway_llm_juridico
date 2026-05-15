# Nexus Gateway LLM Shield

Plataforma SaaS multi-tenant para detecção de Prompt Injection, Jailbreaks e ameaças semânticas em documentos para LLMs.

## Stack

- Backend: FastAPI, SQLAlchemy, Alembic, Celery, Redis, PostgreSQL, LangChain/LangGraph
- AI: OpenAI + Ollama (híbrido)
- Parsing/OCR: PyMuPDF, pdfplumber, python-docx, openpyxl, python-pptx, BeautifulSoup, PaddleOCR
- Frontend: Next.js, React, Tailwind, shadcn/ui, TypeScript
- Infra: Docker, Kubernetes-ready, Terraform-ready, GitHub Actions CI

## Funcionalidades implementadas

- Multi-tenant por `tenant_id` em toda a camada de dados
- Auth JWT + RBAC (`superadmin`, `admin`, `analyst`, `viewer`)
- Criação e revogação de API Bearer Tokens para integração B2B
- Upload múltiplo de arquivos + análise por URL/texto/base64
- Pipeline de segurança documental:
  - Sanitização
  - Extração textual
  - OCR
  - Heurísticas de segurança
  - Classificação híbrida com LLM
  - Threat scoring
  - Relatório JSON
- AI Document Security Gateway:
  - `POST /api/v1/analyze`
  - `POST /api/v1/analyze/jobs`
  - `GET /api/v1/analyze/jobs/{job_id}`
  - `GET /api/v1/files/{file_id}/report`
  - `GET /api/v1/files/{file_id}/rag-md`
- Quarentena com revisão manual (approve/reject)
- Dead-letter de webhooks com replay manual e automático
- Métricas de entrega de webhook para SuperAdmin
- Painel tenant para acompanhar entregas de webhook

## Segurança de webhook

- Assinatura HMAC opcional (`X-Nexus-Webhook-Signature`)
- Header de idempotência (`X-Nexus-Event-Id`)
- Bloqueio de callback para redes privadas/loopback (SSRF hardening)
- Allowlist opcional de domínios de callback
- Retry com backoff exponencial
- Dead-letter com tentativa automática via Celery Beat

## Subir localmente

```bash
docker compose up --build
```

Serviços:

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:3000`

## Fluxo mínimo

1. Registrar tenant/admin: `POST /api/v1/auth/register`
2. Login: `POST /api/v1/auth/login`
3. Gerar API token em `API Tokens`
4. Consumir gateway com `Authorization: Bearer <token>`

## SuperAdmin global (bootstrap)

Com `SUPERADMIN_AUTO_BOOTSTRAP=true`, o usuário global é criado no startup.

- `SUPERADMIN_EMAIL=superadmin@nexusshield.ai`
- `SUPERADMIN_PASSWORD=StrongPass#2026`

## Teste de carga (gateway)

Script utilitário:

```bash
python tests/load_gateway.py --base-url http://localhost:8000/api/v1 --email superadmin@nexusshield.ai --password StrongPass#2026 --concurrency 10 --requests 100
```

## Produção

- Trocar `SECRET_KEY` e `ENCRYPTION_KEY`
- Habilitar TLS no Ingress/API Gateway
- Mover storage para S3/GCS/Azure Blob
- Usar KMS/HSM para chaves
- Ativar observabilidade (logs, métricas, traces)
