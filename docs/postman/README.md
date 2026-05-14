# Postman Integration

## Files

- `Nexus-LLM-Shield.postman_collection.json`
- `Nexus-LLM-Shield.local.postman_environment.json`

## How to use

1. Import the collection file.
2. Import the environment file.
3. Select environment `Nexus LLM Shield - Local`.
4. Run in this order:
   - `Auth/Login` (or `Auth/Register` first time)
   - `API Tokens/Create API Token`
   - `Gateway - Analyze/Analyze Async Job (url/full_report)`
   - `Gateway - Analyze/Get Analyze Job`
   - `Gateway - Analyze/Get File Report`
   - `Gateway - Analyze/Get File RAG Markdown`

## Notes

- `accessToken` and `apiToken` are auto-saved by test scripts.
- `jobId` and `fileId` are auto-saved after async job creation.
- For `Analyze Sync (file/rag_markdown)`, choose a file in the `file` form-data field before sending.
- Keep `tenantId` empty unless you need strict tenant assertion in payload.
- Use `callbackSecret` to enable signed callbacks (`X-Nexus-Webhook-Signature`).
- Use `callbackAuthBearer` when the receiver webhook requires bearer auth.
- `Login` now requires only `email` + `password` (no `tenantSlug`).
