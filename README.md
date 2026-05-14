# Nexus LLM Shield

Plataforma SaaS multi-tenant para detecÃ§Ã£o de Prompt Injection, Jailbreaks e ameaÃ§as semÃ¢nticas em documentos para LLMs.

## Stack

- Backend: FastAPI, SQLAlchemy, Alembic, Celery, Redis, PostgreSQL, LangChain/LangGraph
- AI: OpenAI + Ollama (hÃ­brido)
- Parsing/OCR: PyMuPDF, pdfplumber, python-docx, openpyxl, python-pptx, BeautifulSoup, PaddleOCR
- Frontend: Next.js, React, Tailwind, componentes estilo shadcn/ui, TypeScript
- Infra: Docker, Kubernetes-ready, Terraform-ready, GitHub Actions CI

## Funcionalidades implementadas

- Multi-tenant por `tenant_id` em toda a camada de dados
- Auth JWT + RBAC (`admin`, `analyst`, `viewer`)
- CriaÃ§Ã£o e revogaÃ§Ã£o de API Bearer Token para integraÃ§Ã£o B2B
- Upload de mÃºltiplos arquivos, validaÃ§Ã£o de mime/extensÃ£o/tamanho
- Endpoint para anÃ¡lise por URL
- Bloqueio de extensÃµes executÃ¡veis e inspeÃ§Ã£o de ZIP
- DetecÃ§Ã£o de macro em Office OpenXML (heurÃ­stica)
- Pipeline modular:
  - SanitizaÃ§Ã£o
  - ExtraÃ§Ã£o textual
  - OCR
  - HeurÃ­sticas de seguranÃ§a
  - ClassificaÃ§Ã£o hÃ­brida LLM
  - Threat scoring
  - RelatÃ³rio JSON
- ExportaÃ§Ã£o de texto sanitizado (`/scans/{scan_id}/sanitized.txt`)
- Audit log por tenant
- Rate limit por tenant (Redis)

## Subir localmente

```bash
docker compose up --build
```

Backend em `http://localhost:8000` e frontend em `http://localhost:3000`.

## Fluxo mÃ­nimo de uso

1. Criar tenant+admin via `POST /api/v1/auth/register`
2. Logar via `POST /api/v1/auth/login` e pegar JWT
3. No app web, colar o JWT em "Conectar"
4. Gerar API token no painel "API Bearer Token"
5. Consumir endpoint de anÃ¡lise com `Authorization: Bearer <token>`

## Endpoints principais

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/tokens`
- `GET /api/v1/tokens`
- `POST /api/v1/tokens/{token_id}/revoke`
- `POST /api/v1/uploads/scan-sync`
- `POST /api/v1/uploads/scan-async`
- `POST /api/v1/uploads/scan-url`
- `GET /api/v1/scans`
- `GET /api/v1/scans/{scan_id}`
- `GET /api/v1/scans/{scan_id}/sanitized.txt`

## ObservaÃ§Ãµes de produÃ§Ã£o

- Trocar `SECRET_KEY` e `ENCRYPTION_KEY`
- Habilitar TLS no Ingress/API Gateway
- Armazenar arquivos em object storage (S3/GCS/Azure Blob)
- Usar KMS/HSM para chaves de criptografia
- Ativar observabilidade (metrics/traces/logs)
