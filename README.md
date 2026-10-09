# Life Coach

Личен AI коуч за **навици, вярвания и идентичност**.

- **Сайт / PWA** (Next.js) — табло, чат, кратки и дълбоки сесии, история, check-in-и, настройки на напомняния. Инсталира се на телефон и компютър директно от браузъра.
- **Web Push напомняния** — идват и когато браузърът е затворен; един клик отваря нужния екран.
- **Telegram бот (по избор)** — отделен процес; не е нужен за напомнянията.

Стек: Next.js (App Router) + Tailwind v4 + Neon Postgres (Drizzle) + OpenAI/Anthropic + Web Push (VAPID) + Upstash QStash.

---

## Архитектура

```
Телефон/компютър (PWA + service worker)
        |  абонамент за push
        v
Next.js във Vercel  <---->  Neon Postgres
        |
        |  създава график за всяко напомняне
        v
     QStash  --(подписан POST в точния час)-->  /api/push/dispatch
                                                     |
                                                     v
                                    Web Push -> service worker -> известие
```

- **Няма постоянен процес и няма проверка на базата на всяка минута.** QStash вика сайта само когато има реално напомняне, така че Neon може да заспива.
- Текстът на известието е **шаблон** (без LLM разход при изпращане).
- Един и същ (напомняне, дата) не може да се изпрати два пъти (идемпотентност в `lc_notification_deliveries`).
- Графици се създават **само** ако потребителят има регистрирано устройство, не е на пауза и напомнянето е активно.

---

## Настройка

### 1. Зависимости и env

```bash
npm install
cp .env.example .env
npm run vapid      # генерира VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
```

Попълни `.env` (виж коментарите в `.env.example`). Задължителни за сайта: `DATABASE_URL`, `OPENAI_API_KEY`, `SESSION_SECRET`, `WEB_URL`. За напомняния: `VAPID_*` и `QSTASH_*`.

### 2. База данни

```bash
npm run db:init    # идемпотентно: CREATE/ALTER ... IF NOT EXISTS, само lc_ таблици
```

### 3. Стартиране локално

```bash
npm run dev        # сайт на http://localhost:3000
```

Локално `localhost` не е достъпен за QStash, затова графиците ще покажат състояние „грешка: WEB_URL е локален“. За тест на известията ползвай бутона „Тестово известие“ в **Настройки**. Service worker работи на `localhost`; на телефон изисква HTTPS (Vercel).

### Първи админ

Регистрирай се с имейл от `ADMIN_EMAILS` или задай `lc_users.is_admin = true` (`npm run db:studio`).

---

## Деплой във Vercel

1. Свържи GitHub репото във Vercel (framework: Next.js; `vercel.json` е добавен).
2. Добави environment променливите от `.env.example` (без Telegram).
3. Задай `WEB_URL` към публичния адрес (https://…vercel.app или свой домейн).
4. Пусни `npm run db:init` еднократно с продукционния `DATABASE_URL`.
5. В [Upstash QStash](https://console.upstash.com/qstash) вземи `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`.
6. Отвори сайта → **Настройки** → „Включи известията“ → „Тестово известие“.

**Checklist преди пускане**
- [ ] `SESSION_SECRET` е поне 32 знака.
- [ ] `INVITE_CODES` е зададен (invite-only), `DAILY_MESSAGE_LIMIT` е разумен.
- [ ] OpenAI/Anthropic имат spending limit в техните dashboard-и.
- [ ] Neon: включен scale-to-zero; няма друг процес, който държи връзка/проверява базата.
- [ ] В Railway няма стари услуги, които още работят (виж `PROJECT_REVIEW_AND_ROADMAP_BG.md`).
- [ ] Vercel Hobby е само за лична/некомерсиална употреба.

### iPhone
Web Push работи на iOS/iPadOS 16.4+ само ако сайтът е добавен на началния екран (Share → Add to Home Screen) и е отворен оттам поне веднъж.

---

## Telegram бот (по избор, НЕ във Vercel)

Ботът използва long-polling и затова е отделен постоянен процес:

```bash
npm run bot        # production
npm run bot:dev    # с auto-restart
```

- Нужен е `TELEGRAM_BOT_TOKEN`. Препоръчително е `TELEGRAM_ALLOWED_IDS`.
- `railway.json` е конфигуриран само за този процес (`npm run bot`, 1 реплика). Не го пускай на повече от една реплика.
- Ботът пази опростен минутен scheduler за Telegram напомняния — това е единственото място, което проверява базата периодично. Ако не ползваш Telegram, не стартирай процеса. Ако ботът е само за разговор, задай `TELEGRAM_SCHEDULER=off` — тогава няма минутна проверка и Neon може да заспива.

Команди: `/start`, `/short`, `/deep`, `/checkin`, `/end`, `/habits`, `/reminders`, `/link`, `/reset`.

---

## Етапно пускане (приятели и тестване)

1. **Само ти:** деплой във Vercel, `npm run db:init`, включи известията на телефона и компютъра, провери тестовото известие и едно реално напомняне (след 2-3 минути).
2. **2-3 близки приятели:** задай `INVITE_CODES` (по един код на човек), `DAILY_MESSAGE_LIMIT` (напр. 60-100) и spending limit при OpenAI/Anthropic. На iPhone ги насочи към „Добави към началния екран“.
3. **След 1-2 седмици:** прегледай `lc_notification_deliveries` (грешки), разходите и обратната връзка. Чак тогава разшири кръга или обмисли APK през TWA.

Известно ограничение: ако в базата вече има записани глобални промпти (от админ панела), те пазят старите текстове — натисни „Върни по подразбиране“ в Админ → Настройки, за да вземат новите (безопасност, кратка сесия, check-in).

---

## Структура

```
app/                  Next.js App Router (табло, чат, история, настройки, админ, API)
components/           Споделени UI компоненти (навигация, тема, PWA, push)
public/sw.js          Service worker (push + offline страница)
src/core/             Коучинг ядро (coach, tools, safety, settings)
src/notifications/    Време/дни, шаблони, dispatch, QStash, Web Push, DB слой
src/llm/              OpenAI + Anthropic
src/bot.ts, index.ts, scheduler.ts   Опционален Telegram процес
scripts/init-db.ts    Идемпотентен SQL bootstrap
tests/                Vitest
```

## Команди

```bash
npm run dev          # сайт
npm run build        # production build
npm run typecheck    # TypeScript
npm test             # unit тестове
npm run vapid        # нови VAPID ключове
npm run db:init      # синхронизира lc_ таблиците
npm run bot          # опционален Telegram бот
```

## Ограничения (честно)

- Rate limiting в паметта е „по най-добро усилие“ на Vercel (всеки инстанс има своя памет). Твърдият лимит на разхода е `DAILY_MESSAGE_LIMIT` (брои се в базата).
- Тихи часове **пропускат** известие, не го отлагат.
- Известието зависи от браузъра/ОС: режим „Не безпокойте“, оптимизация на батерията или блокирани известия могат да го скрият.
- Директен APK файл не се разпространява на този етап; PWA е достатъчна. TWA/APK може да се добави по-късно от същия сайт.
