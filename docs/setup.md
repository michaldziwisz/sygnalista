# Setup (GitHub + Cloudflare)

## 1) Prywatne repo na logi: `support-intake`

Utwórz prywatne repo (np. w tym samym koncie/org co aplikacje). Przykład (CLI):

```bash
gh repo create michaldziwisz/support-intake --private --confirm
```

## 2) Konfiguracja Cloudflare Worker

Wymagane zmienne:

- `APP_REPO_MAP` – JSON: `{"sara":"owner/sara","programista":"owner/programista"}`
- `INTAKE_REPO` – np. `michaldziwisz/support-intake`
- `INTAKE_BRANCH` – domyślnie `main`

Opcjonalnie:

- `APP_TOKEN_MAP` – JSON (sekret): `{"sara":"<losowy-token>","programista":"<losowy-token>"}`
  - Jeśli ustawisz, aplikacja musi wysyłać nagłówek `x-sygnalista-app-token`.
  - Tokeny możesz wygenerować: `python3 scripts/generate_app_tokens.py sara programista`
- `TELEGRAM_CHAT_ID` – chat ID lub nazwa kanału (np. `123456789` albo `@twoj_kanal`)
  - Jeśli ustawisz razem z `TELEGRAM_BOT_TOKEN`, Worker będzie wysyłał powiadomienie na Telegram po utworzeniu issue.
  - To ma być ID Twojego czatu (np. z `message.chat.id`), a nie `@username` ani ID bota.
- `TELEGRAM_BOT_TOKEN` – token bota (sekret)
- `RATE_LIMIT_PER_MINUTE` – domyślnie `6`
- `MAX_LOG_BASE64_LENGTH` – domyślnie `8000000` (limit dla `logs.dataBase64`)

### Auth do GitHub (2 opcje)

#### Opcja A (najprostsza): fine-grained PAT

Stwórz fine-grained PAT ograniczony do wybranych repo (docelowe app repo + `support-intake`) z uprawnieniami:

- `Issues: Read and Write`
- `Contents: Read and Write` (wymagane dla `support-intake`)

Następnie w Workerze ustaw sekret `GITHUB_TOKEN`.

#### Opcja B: GitHub App (ładne „[bot]” jako autor)

Alternatywnie możesz użyć GitHub App, wtedy Worker potrzebuje:

- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY` (PEM)
- `GITHUB_APP_INSTALLATION_ID`

Wskazówki:

- `GITHUB_APP_ID` znajdziesz w ustawieniach GitHub App.
- `GITHUB_APP_PRIVATE_KEY` generujesz w ustawieniach GitHub App („Generate a private key”).
- `GITHUB_APP_INSTALLATION_ID` to liczba w URL strony instalacji, np. `https://github.com/settings/installations/<ID>`.

Uprawnienia App:

- `Issues: Read and Write`
- `Contents: Read and Write` (dla `support-intake`)

Po utworzeniu App zainstaluj ją na repozytoriach aplikacji (tam gdzie mają powstawać issues) oraz na `support-intake`.

## 2a) (Opcjonalnie) Powiadomienia na Telegram

1) Utwórz bota w `@BotFather` i skopiuj token.
2) Ustaw sekrety/zmienne w Workerze:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
# a TELEGRAM_CHAT_ID jako var (wrangler.toml) albo też jako sekret:
wrangler secret put TELEGRAM_CHAT_ID
```

Żeby znaleźć `chat_id`:

- Napisz do bota (w prywatnym czacie lub dodaj go do grupy), a potem wywołaj:
  - `curl -sS "https://api.telegram.org/bot<TOKEN>/getUpdates"`
  - w odpowiedzi szukaj pola `message.chat.id`.
  - Jeśli widzisz błąd `403 Forbidden: bots can't send messages to bots`, to znaczy że ustawione jest ID bota, nie Twoje.

## 3) Deploy Workera

```bash
cd worker
npm install
cp wrangler.toml.example wrangler.toml
# edytuj wrangler.toml: APP_REPO_MAP, INTAKE_REPO
wrangler login
wrangler secret put GITHUB_TOKEN
# opcjonalnie:
# wrangler secret put APP_TOKEN_MAP
# wrangler secret put TELEGRAM_BOT_TOKEN
# wrangler secret put TELEGRAM_CHAT_ID
wrangler deploy
```

Po deployu będziesz mieć URL Workera np. `https://sygnalista.<subdomain>.workers.dev`.

### Jeśli `wrangler login` wisi na WSL (Windows browser)

Czasem po autoryzacji w przeglądarce Windows wrangler w WSL dalej “czeka”, bo redirect trafia na `localhost` po stronie Windows.

Workaround:

1) Uruchom `npx wrangler login --browser=false` i dokończ autoryzację w przeglądarce.
2) Gdy przeglądarka przejdzie na adres typu `http://localhost:8976/...` (i strona się nie otworzy), skopiuj pełny URL z paska.
3) W WSL wykonaj: `curl -sS '<SKOPIOWANY_URL>' >/dev/null` — wrangler powinien od razu zakończyć logowanie.

## 4) Integracja w aplikacji (Python)

Instrukcja + przykład: `python/README.md`.

### UX / prywatność (ważne)

- Jeśli zbierasz `email`, pokaż w UI jasne ostrzeżenie: „E-mail będzie publiczny w issue na GitHub”.
- Pokaż checkbox „Dołącz logi” + krótką informację, że log może zawierać dane wrażliwe.
