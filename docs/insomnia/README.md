# Insomnia Integration

## File

- `Nexus-LLM-Shield.insomnia.json`

## Import

1. Open Insomnia.
2. Go to `Create` > `Import`.
3. Choose `File` and select `Nexus-LLM-Shield.insomnia.json`.
4. Select the workspace `Nexus LLM Shield - AI Document Security Gateway`.

## Environment variables

Base environment already includes:

- `base_url`
- `tenant_slug`
- `tenant_id`
- `admin_email`
- `admin_password`
- `access_token`
- `api_token`
- `job_id`
- `file_id`
- `callback_url`

## Suggested run order

1. `Auth/Login` (or `Auth/Register` first run)
2. `API Tokens/Create API Token`
3. Copy `access_token` and `api_token` from responses to environment
4. `Gateway - Analyze/Analyze Async Job (url/full_report)`
5. Copy `job_id` and `file_id` from response to environment
6. `Gateway - Analyze/Get Analyze Job`
7. `Gateway - Analyze/Get File Report`
8. `Gateway - Analyze/Get File RAG Markdown`

## Notes

- In `Analyze Sync (file/rag_markdown)`, choose the local file in the multipart `file` field before sending.
- If you do not need strict tenant assertion, keep `tenant_id` empty.
