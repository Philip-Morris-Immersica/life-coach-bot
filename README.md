# Life Coach

Личен AI коуч за **навици, вярвания и идентичност**. Две лица, една памет:
- **Telegram бот** — проактивни сутрешни/вечерни check-in-и, дълбоки сесии, всекидневен разговор.
- **Уеб приложение** — табло (цели, навици, прогрес), чат сесии в браузъра, история, и **админ панел** за редактиране на промпти, модели и настройки на бота.

Стек: **Node + TypeScript + Telegraf + OpenAI + Neon (Drizzle ORM) + Next.js (App Router) + Tailwind v4**.

---

## Какво прави

- **Опознавателна сесия** при първо влизане — естествено интервю за идентичност, вярвания, история, навици и проблеми. Накрая автоматично структурира всичко в профил и поставя цели.
- **Всекидневен режим** — кратки, подкрепящи отговори; при по-дълбок проблем предлага дълбока сесия.
- **Дълбоки сесии** — Сократов диалог; в края извлича едно ключово прозрение и го пази.
- **Проактивни напомняния** — сутрешен фокус и вечерна рефлексия (cron в часовата зона на сървъра).
- **Обща памет** — профил, навици, история и прозрения, едни и същи в Telegram и в уеб.
- **Админ панел** — редактирай промптовете, моделите, температурите и часовете на напомнянията на живо. Промените важат веднага (10s кеш).

## Памет (таблици)

Всички с префикс `lc_` (за да съжителства спокойно с други проекти в същата Neon база):
`lc_users`, `lc_profiles`, `lc_habits`, `lc_check_ins`, `lc_messages`, `lc_insights`, `lc_link_codes`, `lc_settings`.

---

## Настройка (еднократно)

### 1. Зависимости и `.env`

```bash
npm install
cp .env.example .env
```

Попълни в `.env`:

| Променлива | За какво | Откъде |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | За Telegram бота | @BotFather → `/newbot` |
| `OPENAI_API_KEY` | За LLM-а | OpenAI dashboard |
| `OPENAI_MODEL_FAST` / `OPENAI_MODEL_DEEP` | Модели (по подразбиране gpt-4o-mini / gpt-4o) | по избор |
| `DATABASE_URL` | Neon connection string | console.neon.tech (с `?sslmode=require`) |
| `SESSION_SECRET` | Подпис на уеб сесиите (>=32 hex) | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ADMIN_EMAILS` | Списък имейли (през запетая), които при регистрация стават админи | по избор |
| `MORNING_HOUR` / `MORNING_MINUTE` / `EVENING_HOUR` / `EVENING_MINUTE` / `TIMEZONE` | Fallback за check-in часовете (админ панелът override-ва) | по избор |

### 2. Създай таблиците

```bash
npm run db:init
```

Това е идемпотентно (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) и **не пипа** други таблици в базата.

---

## Стартиране (локално)

В два терминала:

```bash
# Терминал 1: Telegram бот
npm run dev     # или: npm start

# Терминал 2: уеб приложение
npm run web:dev
```

Уеб приложението работи на http://localhost:3000.

### Първи админ

1. В сайта се регистрирай с имейл от списъка `ADMIN_EMAILS`. Автоматично ставаш админ.
2. Алтернативно: регистрирай се нормално, после в Neon Studio (`npm run db:studio`) промени `lc_users.is_admin = true` за твоя ред.

### Свързване на Telegram с уеб профила

1. Влез в Telegram бота, пиши `/link` — получаваш 8-знаков код.
2. В сайта отиди на „Telegram" → въведи кода.
3. Готово — историята, навиците и прозренията от двата канала се сливат.

---

## Команди в Telegram бота

| Команда | Действие |
|---|---|
| `/start` | Първо посрещане / опознавателна сесия |
| `/deep` | Започни дълбока коучинг сесия |
| `/end` | Приключи дълбоката сесия (запазва прозрение) |
| `/habits` | Покажи активните навици |
| `/checkins on\|off` | Включи/изключи проактивните напомняния |
| `/link` | Код за свързване с уеб профила |
| `/reset` | Започни опознаването наново |

---

## Структура на проекта

```
src/
  bot.ts            Telegram handlers (тънка обвивка)
  index.ts          entrypoint за бота (scheduler + bot.launch)
  scheduler.ts      cron за check-in-и
  memory.ts         CRUD върху Neon (lc_ таблици)
  prompts.ts        Default промпти (fallback за lc_settings)
  openai.ts         OpenAI клиент
  core/
    coach.ts        КОУЧИНГ ЯДРО (използва се от бота И уеб API)
    settings.ts     Четене/запис на lc_settings с кеш
  db/
    index.ts, schema.ts   Drizzle

app/                Next.js App Router
  page.tsx          Табло
  chat/             Уеб чат / сесия
  history/          История на разговорите и прозренията
  link-telegram/    Свързване с Telegram
  admin/            Админ панел (потребители, настройки)
  api/              Server route-и (auth, chat, admin)

lib/                Уеб-specific помощници (auth, session, dashboard)
scripts/init-db.ts  Идемпотентен SQL bootstrap (lc_ таблици)
```

---

## Деплой на Railway

Препоръчителен setup: **две услуги, едно репо**, обща Neon база.

1. Качи репото в GitHub.
2. В Railway създай **нов проект → Deploy from GitHub**.
3. Създай **две services** в проекта (и двете сочат към същото репо):
   - **`web`** — start command: `npm run web:start`, build command: `npm ci && npm run web:build`.
   - **`bot`** — start command: `npm run start`, build command: `npm ci`.
   - (Файловете `railway.web.toml` и `railway.bot.toml` са за референция; в Railway-Settings можеш да ги вмъкнеш ръчно или да настроиш командите от UI-то.)
4. Сложи environment променливите от секцията [Настройка](#настройка-еднократно) и на **двете** services (обща Neon база, общ OpenAI ключ, общ `SESSION_SECRET`).
5. Пусни `npm run db:init` веднъж (от локалната ти машина с продукционния `DATABASE_URL`, или като еднократен Railway job), за да създадеш таблиците.
6. Изложи публичен URL за `web` (Settings → Networking → Generate Domain) — този домейн ще е сайтът ти.
7. Restart на `bot` всеки път, когато промениш часовете за check-in в админ панела (cron schedule се чете при стартиране).

### Защо две services?
- Ботът използва long-polling към Telegram (постоянно работещ процес).
- Уеб приложението сервира HTTP заявки и може да scale-ва независимо.
- Един общ процес би смесил тези два много различни жизнени цикъла.

---

## Полезни команди

```bash
npm run dev          # бот с auto-restart
npm start            # бот (production)
npm run web:dev      # сайт на localhost:3000
npm run web:build    # production build на сайта
npm run web:start    # пускане на build-натия сайт

npm run db:init      # създай/мигрирай lc_ таблици (идемпотентно)
npm run db:studio    # Drizzle Studio за оглед на данните
```
