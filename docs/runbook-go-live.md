# Runbook Operacional - Go-Live Rápido

Este documento é o guia operacional único para subir o **Nexus Gateway LLM Shield** em ambiente de staging/produção com o menor risco possível.

## 1. Pré-requisitos

- Docker + Docker Compose funcionando.
- Acesso ao repositório e permissão para deploy.
- DNS/domínios do frontend e backend definidos.
- Credenciais de LLM (ex.: OpenAI) e SMTP.

## 2. Variáveis obrigatórias

Configurar no ambiente (ou arquivo `.env` do deploy):

- `SECRET_KEY` (forte e única)
- `ENCRYPTION_KEY` (forte e única)
- `DATABASE_URL`
- `REDIS_URL`
- `CORS_ORIGINS` (domínio real do frontend)
- `ALLOWED_HOSTS` (domínio real do backend)
- `FRONTEND_BASE_URL` (ex.: `https://app.seudominio.com`)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`

Recomendado:

- `FORCE_HTTPS=true` quando houver TLS no ingress/proxy.
- `SUPERADMIN_AUTO_BOOTSTRAP=true` apenas para bootstrap inicial.

## 3. Deploy (passo a passo)

### 3.1 Atualizar código

```powershell
git checkout main
git pull origin main
```

### 3.2 Build e subida dos serviços

```powershell
docker compose up -d --build
```

### 3.3 Aplicar migrations

```powershell
docker compose exec -T backend sh -lc "cd /app && PYTHONPATH=/app alembic upgrade head"
```

### 3.4 Reiniciar backend e workers

```powershell
docker compose restart backend worker worker-beat
```

## 4. Smoke técnico

### 4.1 Healthcheck

```powershell
curl.exe -sS http://localhost:8000/api/v1/health
```

Esperado: JSON com `status: healthy`.

### 4.2 Logs essenciais

```powershell
docker compose logs --tail 200 backend
docker compose logs --tail 200 worker
docker compose logs --tail 200 worker-beat
```

Sem stacktrace recorrente.

## 5. Smoke funcional (UI)

1. Login com SuperAdmin.
2. Criar/validar tenant.
3. Em **SuperAdmin LLM**, configurar 1 provider ativo.
4. Em **Users**:
   - criar usuário tenant
   - confirmar e-mail (link de convite)
   - validar troca obrigatória de senha no primeiro acesso
5. Em **Settings**, executar **SMTP Test**.

## 6. Smoke funcional (API Gateway)

Validar endpoints:

- `POST /api/v1/analyze`
- `POST /api/v1/analyze/jobs`
- `GET /api/v1/analyze/jobs/{job_id}`
- `GET /api/v1/files/{file_id}/report`
- `GET /api/v1/files/{file_id}/rag-md`

Validar também:

- callback webhook + retries
- dead-letter e replay no dashboard

## 7. Critérios de aceite (Go-Live)

Deploy considerado pronto quando:

1. Healthcheck OK.
2. Worker e beat estáveis.
3. Login/RBAC OK.
4. Analyze sync e async OK.
5. Report + RAG Markdown OK.
6. Webhook retry/dead-letter OK.
7. Gestão de usuários + onboarding seguro OK.
8. SMTP test OK.

## 8. Rollback rápido

Se houver falha após deploy:

1. Voltar para commit anterior estável.
2. Rebuild/restart dos serviços.
3. Se migration incompatível já aplicada:
   - fazer rollback controlado de schema (somente se planejado e validado)
   - ou hotfix forward (preferível quando já há dados novos).

Comandos base:

```powershell
git log --oneline -n 10
git checkout <commit_estavel>
docker compose up -d --build
```

Importante: evitar rollback destrutivo de banco sem backup.

## 9. Troubleshooting rápido

### 9.1 `403 Password change required`

- Usuário está com `must_change_password=true`.
- Direcionar para `/first-access` e trocar senha.

### 9.2 `401 Invalid credentials` no onboarding

- Verificar se e-mail foi confirmado.
- Confirmar fluxo em `/confirm-email`.

### 9.3 SMTP test falha com `400 SMTP is not configured`

- Configurar `SMTP_HOST` e `SMTP_FROM_EMAIL` no ambiente.
- Reiniciar backend.

### 9.4 Lentidão em análises

- Verificar backlog em filas.
- Escalar workers.
- Revisar limites por plano e tamanho dos lotes.

### 9.5 Webhook não entrega

- Verificar URL de callback.
- Consultar tentativas/retries/dead-letter.
- Validar bloqueios de rede/SSRF policy.

## 10. Pós go-live imediato (D+1)

- Habilitar monitoramento contínuo de:
  - taxa de erro
  - tempo médio de análise
  - backlog de fila
  - falhas de webhook
- Revisar alertas operacionais e canais de notificação.
- Confirmar rotina de backup e restauração testada.
