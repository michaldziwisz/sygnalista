# sygnalista-reporter (Python)

Minimalny klient (bez zewnętrznych zależności) do wysyłania zgłoszeń do endpointu `sygnalista` (Cloudflare Worker).

## Szybkie użycie

```python
from sygnalista_reporter import send_report

result = send_report(
    base_url="https://<twoj-worker>.workers.dev",
    app_id="sara",
    app_version="1.2.3",
    kind="bug",
    title="Nie działa X",
    description="Kroki odtworzenia: ...",
    email="user@example.com",
    log_path="C:/path/to/app.log",
    app_token=None,  # jeśli włączysz APP_TOKEN_MAP w Workerze
)
print(result["issue"]["html_url"])
```

