# sygnalista

„Sygnalista” to prosty system zgłoszeń z aplikacji desktop (bez konta GitHub użytkownika):

- Desktop app wysyła formularz + diagnostykę + (opcjonalnie) logi do Cloudflare Workera.
- Worker tworzy issue w odpowiednim repozytorium na GitHub.
- (Opcjonalnie) Worker wysyła powiadomienie na Telegram po utworzeniu issue.
- Pełny payload + logi trafiają do prywatnego repo `support-intake`, a publiczne issue zawiera linki do tych plików.

## Struktura

- `worker/` – Cloudflare Worker (`POST /v1/report`)
- `python/` – minimalny klient w Pythonie do wysyłania zgłoszeń

## Start (high level)

1) Utwórz prywatne repo `support-intake` (na logi i payload).
2) Skonfiguruj Worker (mapowanie `appId -> owner/repo`, auth do GitHub).
3) W aplikacji dodaj UI „Zgłoś błąd / sugestię” i użyj klienta z `python/`.

Instrukcje krok po kroku: `docs/setup.md`.
API: `docs/api.md`.
