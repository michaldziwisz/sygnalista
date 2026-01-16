# API

## `POST /v1/report`

Content-Type: `application/json`

Nagłówki opcjonalne:

- `x-sygnalista-app-token: <token>` – jeśli w Workerze ustawisz `APP_TOKEN_MAP`.

### Request (przykład)

```json
{
  "app": { "id": "sara", "version": "1.2.3", "build": "2026.01.16", "channel": "stable" },
  "kind": "bug",
  "title": "Nie działa X",
  "description": "Kroki odtworzenia: ...",
  "email": "user@example.com",
  "diagnostics": { "os": { "system": "Windows" } },
  "logs": {
    "fileName": "app.log.gz",
    "contentType": "application/gzip",
    "encoding": "base64",
    "dataBase64": "<base64 gzip bytes>",
    "originalBytes": 123456,
    "truncated": false
  }
}
```

### Response (201)

```json
{
  "ok": true,
  "reportId": "…",
  "issue": {
    "number": 123,
    "url": "https://api.github.com/repos/…/issues/123",
    "html_url": "https://github.com/…/issues/123"
  }
}
```

### Error response

```json
{
  "error": { "code": "bad_request", "message": "…", "details": { "…" : "…" } }
}
```

