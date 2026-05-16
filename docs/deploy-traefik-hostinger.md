# Deploy em VPS (Hostinger Ubuntu 24) com Traefik

## 1. Pré-requisitos

- Traefik já rodando na VPS com entrypoints `websecure` e cert resolver (ex.: `letsencrypt`).
- Rede Docker externa do Traefik existente (ex.: `traefik_proxy`).
- DNS apontando:
  - `APP_DOMAIN` -> VPS
  - `API_DOMAIN` -> VPS

## 2. Configuração

1. Copie o arquivo de ambiente:

```bash
cp .env.prod.example .env.prod
```

2. Preencha os valores reais em `.env.prod`.

3. Garanta que a rede externa do Traefik exista:

```bash
docker network ls | grep traefik_proxy || docker network create traefik_proxy
```

## 3. Subida

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

## 4. Migration do banco

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T backend sh -lc "cd /app && PYTHONPATH=/app alembic upgrade head"
```

## 5. Verificação

- API health:

```bash
curl -sS https://$API_DOMAIN/api/v1/health
```

- Frontend:
  - `https://$APP_DOMAIN`

## 6. Observações importantes

- Em produção, não exponha portas de backend/postgres/redis ao host.
- `FORCE_HTTPS=true` já está aplicado no compose de produção.
- `CORS_ORIGINS` está limitado ao domínio do app.
- Cookie refresh está configurado como `secure`.
