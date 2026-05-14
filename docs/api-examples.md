# API Examples

## Register

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_name":"Acme Corp",
    "tenant_slug":"acme",
    "email":"admin@acme.com",
    "full_name":"Acme Admin",
    "password":"StrongPass#2026"
  }'
```

## Login

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"StrongPass#2026","tenant_slug":"acme"}'
```

## Create API Token

```bash
curl -X POST http://localhost:8000/api/v1/tokens \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"name":"SIEM Connector","scopes":["scan:write","scan:read"]}'
```

## Sync File Scan

```bash
curl -X POST http://localhost:8000/api/v1/uploads/scan-sync \
  -H "Authorization: Bearer <JWT ou API_TOKEN>" \
  -F "files=@./sample.pdf"
```

## URL Scan

```bash
curl -X POST http://localhost:8000/api/v1/uploads/scan-url \
  -H "Authorization: Bearer <JWT ou API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/prompt.txt","async_mode":false}'
```
