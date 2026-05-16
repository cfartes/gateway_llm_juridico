# Runbook One-Page (Plantão)

Guia operacional rápido para deploy, validação e resposta a incidentes do **Nexus Gateway LLM Shield**.

## 1) Deploy rápido

```powershell
git checkout main
git pull origin main
docker compose up -d --build
docker compose exec -T backend sh -lc "cd /app && PYTHONPATH=/app alembic upgrade head"
docker compose restart backend worker worker-beat
```

## 2) Smoke mínimo (obrigatório)

```powershell
curl.exe -sS http://localhost:8000/api/v1/health
docker compose logs --tail 120 backend
docker compose logs --tail 120 worker
docker compose logs --tail 120 worker-beat
```

Checklist:

- Health `status=healthy`
- Sem erro recorrente no backend/worker
- Login funcionando
- Pelo menos 1 provider LLM ativo

## 3) Validação funcional mínima

1. `POST /api/v1/analyze` (sync)
2. `POST /api/v1/analyze/jobs` + `GET /api/v1/analyze/jobs/{job_id}` (async)
3. `GET /api/v1/files/{file_id}/report`
4. `GET /api/v1/files/{file_id}/rag-md`
5. Webhook callback + retry/dead-letter
6. Users onboarding:
   - convite
   - confirmação e-mail
   - troca obrigatória de senha

## 4) Incidente: resposta rápida

### API fora do ar

```powershell
docker compose ps
docker compose logs --tail 200 backend
docker compose restart backend
```

### Fila travada/lenta

```powershell
docker compose logs --tail 200 worker
docker compose restart worker worker-beat
```

### Webhook falhando

- Verificar dashboard de webhooks (tentativas/dead-letter).
- Validar endpoint do cliente e rede.
- Executar replay.

### Usuário não acessa

- Se `401`: validar credenciais/ativação.
- Se `403 Password change required`: direcionar para `/first-access`.
- Se onboarding: confirmar `/confirm-email`.

### SMTP não envia

- `POST /settings/test-smtp`
- Se `400 SMTP is not configured`: revisar `SMTP_HOST` e `SMTP_FROM_EMAIL`.
- Reiniciar backend após ajuste.

## 5) Rollback de emergência

```powershell
git log --oneline -n 10
git checkout <commit-estavel>
docker compose up -d --build
```

Observações:

- Evitar rollback destrutivo de banco sem backup.
- Se migration já aplicada com dados novos, preferir hotfix forward.

## 6) Variáveis críticas (não esquecer)

- `SECRET_KEY`
- `ENCRYPTION_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `CORS_ORIGINS`
- `ALLOWED_HOSTS`
- `FRONTEND_BASE_URL`
- SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`)
