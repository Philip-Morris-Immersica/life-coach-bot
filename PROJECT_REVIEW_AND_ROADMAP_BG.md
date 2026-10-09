# Life Coach — преглед и препоръчан roadmap

Актуално към: 9 октомври 2026 г.

Този документ е технически и продуктов преглед на текущото хранилище. Той не потвърждава реалните фактури в Railway, Neon, OpenAI, Anthropic, Vercel или GitHub, защото за това е нужен достъп до съответните billing dashboards.

## 1. Кратък извод

Проектът има добра основа: единно коучинг ядро, обща памет за уеб и Telegram, структурирани инструменти за профил, навици и напомняния, уеб чат, история и админ панел.

Основните проблеми в момента са:

1. Deployment конфигурацията и README си противоречат. Това може да стартира повече от един Telegram bot и scheduler.
2. Scheduler-ът чете Neon всяка минута. Така базата трудно може да остане неактивна и да се възползва от scale-to-zero.
3. Напомнянията се доставят само през Telegram, въпреки че могат да бъдат създадени и от уеб потребители.
4. Всяко изпратено напомняне прави LLM заявка, което добавя ненужен разход.
5. Сайтът още не е PWA и няма browser push известия.
6. Коучът има добър начален prompt, но липсват safety правила, измерим прогрес, кратки сесии, седмичен преглед и надеждна дългосрочна памет.
7. Публичната регистрация и Telegram ботът нямат rate limit или allowlist. При публично пускане някой може да натрупа LLM разход.

### Моята препоръка

Най-балансираният вариант е:

- GitHub да остане източникът на кода.
- Next.js сайтът и API routes да се преместят във Vercel.
- Neon да остане базата поне в първата версия.
- Telegram long-polling и `node-cron` да не се стартират във Vercel.
- Сайтът да стане PWA, която се инсталира директно от браузъра.
- Напомнянията да минат към Web Push.
- За планирането им да се използва serverless scheduler като QStash, с отделен schedule за всяко активно напомняне, вместо постоянен процес и проверка на базата всяка минута.
- Съобщението за напомняне да е шаблонно или генерирано еднократно при създаване, а не с нов LLM call при всяко изпращане.
- Истински APK да се добави чак след стабилизиране на PWA. Ако изобщо е нужен, най-лекият вариант е Trusted Web Activity с Bubblewrap, а не отделно React Native/Expo приложение.

Това запазва един codebase, премахва постоянния Railway процес и позволява приложението да работи като сайт и като инсталирано приложение.

## 2. Какво има в проекта днес

### Основни части

- Next.js 16 App Router сайт: `app/`
- Уеб чат: `app/chat/`
- Уеб API за коуча: `app/api/chat/route.ts`
- Telegram бот: `src/bot.ts`
- Постоянен scheduler: `src/scheduler.ts`
- Споделено коучинг ядро: `src/core/coach.ts`
- LLM abstraction за OpenAI и Anthropic: `src/llm/`
- Памет и database операции: `src/memory.ts`
- Drizzle/Neon схема: `src/db/schema.ts`
- Prompt-ове и NLP техники: `src/prompts.ts`
- Админ настройки за prompt-ове и модели: `app/admin/`
- Стартиране на бот и scheduler от production Next процеса: `instrumentation.ts`

### Какво е направено добре

- Telegram и сайтът използват едно и също коучинг ядро.
- Има разделение между fast и deep модел.
- Има tool calling за профил, навици, прозрения, timezone и напомняния.
- Историята пази модел, токени и приблизителна цена.
- Има отделни daily, onboarding и deep режими.
- Профилът съдържа идентичност, вярвания, цели, визия и фокус.
- Има отделни deep sessions и извличане на insight в края.
- Neon таблиците са с `lc_` префикс, което е важно, ако базата се споделя с други проекти.
- TypeScript проверката `npx tsc --noEmit` минава успешно към датата на този преглед.

### Техническо състояние

- Няма автоматични тестове.
- Няма `lint` script.
- Няма PWA manifest, service worker, app icons или push subscription логика.
- Няма committed Drizzle migrations директория; използват се `scripts/init-db.ts` и ръчни миграции.
- Има непубликувани локални промени в `next-env.d.ts` и `tsconfig.json`. Те не са направени като част от този преглед.
- GitHub repository-то в момента е публично:
  `https://github.com/Philip-Morris-Immersica/life-coach-bot`

Ако проектът или бъдещата му история съдържат чувствителна информация, repository-то трябва да стане private. `.env` не е tracked, което е правилно.

## 3. Откъде най-вероятно е дошла таксата

### 3.1 Railway — най-вероятният източник

Railway има планове с месечна минимална такса и usage-based compute. Спрян service не използва compute, но активен service с постоянен Node процес работи непрекъснато.

Особено важно: README описва две услуги, но последният код стартира Telegram бота и scheduler-а вътре в production Next процеса чрез `instrumentation.ts`.

В същото време:

- `railway.json` стартира `npm run start`, което вече е `next start`.
- `railway.bot.toml` също стартира `npm run start`, което вече не стартира самостоятелния bot, а втори Next server.
- README още казва да има `web` и `bot` services.

Ако в Railway са останали две services, е възможно да са работили два Next процеса, всеки опитващ да стартира bot и scheduler. Това води до:

- повече Railway compute;
- конфликт между Telegram long-polling процеси;
- дублирани scheduler ticks;
- възможни дублирани напомняния;
- повече Neon и LLM заявки.

### 3.2 Neon — възможен източник

Neon може да scale-не compute-а до zero след неактивност. Текущият scheduler обаче извиква `allActiveReminders()` всяка минута в `src/scheduler.ts`. Така базата получава постоянен трафик дори когато няма активен потребител.

На платен Neon план могат да се начисляват:

- active compute;
- storage;
- instant restore/history;
- допълнителни branches;
- transfer.

Ако тази Neon база се използва и от други проекти, не трябва да се изтрива на сляпо. Първо трябва да се види кои таблици и branches са нужни.

### 3.3 OpenAI и Anthropic — променлив разход

Всеки чат прави LLM заявка, а tool loop-ът може да стигне до 5 rounds.

Всяко напомняне също извиква LLM чрез `generateReminderMessage()`. При два default reminders на ден за всеки потребител това създава постоянен разход, дори когато съдържанието може да бъде шаблон.

Публична регистрация без rate limiting допълнително увеличава риска.

### 3.4 GitHub — малко вероятно

Текущото repository е публично и в него не бяха открити GitHub Actions workflows. Стандартните GitHub-hosted Actions за публични repositories са безплатни. GitHub би могъл да начислява за платен план, Codespaces, Packages, LFS, специални runners или други отделни услуги, но не и просто защото публичният source code стои там.

### 3.5 Какво да се провери в dashboard-ите

Преди нов deploy:

1. Railway:
   - активен plan;
   - брой projects и services;
   - брой replicas;
   - кои services в момента са running;
   - CPU/RAM usage по service;
   - последната invoice разбивка;
   - дали има отделни `web` и `bot` services.
2. Neon:
   - plan;
   - active compute hours;
   - включен ли е scale-to-zero;
   - compute size;
   - branches и storage;
   - дали базата се споделя с други приложения.
3. OpenAI и Anthropic:
   - usage по ден;
   - активни API keys;
   - spending limits;
   - кои модели са използвани.
4. GitHub:
   - Billing and licensing;
   - Actions/Codespaces/Packages usage;
   - платен organization или personal plan.

Не трябва да се изтрива база или project преди export/backup и проверка дали не се ползва от друго приложение.

## 4. Railway или Vercel

### Вариант A — Vercel само за сайта, без напомняния

Това е най-бързият начин проектът отново да е онлайн:

- GitHub → Vercel deployment;
- Next.js web и API routes във Vercel;
- Neon остава database;
- Telegram bot и scheduler са изключени.

Плюсове:

- малко промени;
- няма постоянен server;
- подходящо за временно възстановяване на проекта;
- ниска поддръжка.

Минус:

- няма проактивни напомняния, докато не се добави Web Push.

### Вариант B — Vercel + PWA + Web Push + QStash

Това е препоръчаният target.

Потокът е:

1. Потребителят инсталира PWA и разрешава известия.
2. Browser push subscription се записва в Neon.
3. При създаване или промяна на reminder приложението създава/обновява QStash schedule.
4. В точния час QStash вика защитен Vercel API route.
5. Route-ът изпраща Web Push към всички активни устройства на потребителя.
6. Service worker-ът показва notification и отваря съответния екран при натискане.

Защо отделен schedule за reminder, вместо един cron всяка минута:

- не се чете цялата база всяка минута;
- Neon може да остава suspended между реални събития;
- няма постоянен process;
- timezone може да се пази в schedule-а;
- по-лесно е да се retry-ва конкретно събитие.

Нужно е да се пази външният schedule ID в reminder записа, за да може schedule-ът да бъде обновяван или изтриван.

### Вариант C — Vercel Pro Cron

Технически може да замени текущия минутен cron, но не е оптималният евтин вариант:

- Vercel Hobby позволява cron само веднъж дневно и с неточност до около час.
- Vercel Pro поддържа изпълнение всяка минута.
- Минутен cron отново ще събужда Neon постоянно.

Затова Vercel Cron е добър за един дневен digest или maintenance job, но не и като първи избор за персонални напомняния в произволни часове на евтин план.

### Вариант D — запазване на Railway

Railway остава разумен избор, ако задължително искаме:

- Telegram long-polling;
- постоянен in-process scheduler;
- един винаги активен Node server.

Тогава трябва да има точно една service и една replica, или ясно разделени web и bot services без `instrumentation.ts`. Текущото смесено състояние не трябва да остава.

### Ако Telegram все пак се запази

Telegram не изисква непременно Railway. Ботът може да бъде преработен от long-polling към webhook:

- Telegram праща update към Vercel API route;
- Telegraf обработва update-а в рамките на заявката;
- QStash или друг scheduler доставя напомнянията;
- няма постоянен bot process.

Това е възможна по-късна фаза. Ако Telegram вече не е важен канал, по-просто е първо да бъде изключен, без да се изтрива кодът.

## 5. PWA, browser notifications и APK

### 5.1 PWA — препоръчаният първи mobile вариант

Трябват:

- `manifest.webmanifest`;
- икони поне 192x192 и 512x512;
- `apple-touch-icon`;
- `display: standalone`;
- theme/background colors;
- service worker;
- install CTA с ясни инструкции;
- mobile navigation;
- използване на `dvh` и safe-area за chat екрана.

На Android Chrome инсталираната PWA може да се появи като WebAPK в launcher-а и в системните настройки. Това вече дава усещане за приложение, без ние да разпространяваме отделен APK.

На iPhone/iPad потребителят трябва ръчно да избере Share → Add to Home Screen.

### 5.2 Web Push

Web Push работи, дори когато сайтът не е отворен, чрез browser push service и service worker.

Нужни са:

- VAPID keys;
- таблица `lc_push_subscriptions`;
- subscribe/unsubscribe API;
- permission UX, задействан от действие на потребителя;
- push sender на сървъра;
- `push` и `notificationclick` handlers в service worker-а;
- премахване на невалидни subscriptions;
- настройки на потребителя по устройство.

На iOS/iPadOS Web Push работи за Home Screen web apps от iOS 16.4 нагоре. Потребителят първо трябва да инсталира PWA.

Локално browser notification scheduling без push не е надеждно, когато приложението е затворено. За реални сутрешни и вечерни напомняния са нужни Web Push, Telegram или native push.

### 5.3 Директен APK файл от сайта

Технически може:

- PWA се обвива като Trusted Web Activity;
- Bubblewrap генерира signed APK или Android App Bundle;
- сайтът публикува `.well-known/assetlinks.json`;
- APK може да се качи на сайта или в Google Play.

Но директният APK от сайта има недостатъци:

- Android показва предупреждения за install from unknown sources;
- няма удобни автоматични updates като в Play Store;
- трябва безопасно да пазим signing key;
- всяка промяна по wrapper-а изисква нов signed build;
- потребителите имат по-малко доверие на директен APK.

Затова редът трябва да е:

1. PWA;
2. проверка дали хората реално я инсталират и използват;
3. TWA/AAB в Play Store, ако има продуктова причина;
4. директен APK само като допълнителен канал, не като основен.

### 5.4 Capacitor или Expo

- Capacitor има смисъл, ако по-късно са нужни native plugins, FCM, background tasks, biometric auth или други native APIs.
- Expo/React Native означава втори UI codebase и значително повече поддръжка.

За текущия проект и целта „да не става много сложно“ не препоръчвам нито Capacitor, нито Expo в първите фази.

## 6. Конкретни проблеми в текущия код

### Критични за deployment и разходите

1. `instrumentation.ts` стартира bot и scheduler във всеки production Next process с Telegram token.
2. README още описва две Railway services.
3. `railway.bot.toml` използва `npm run start`, което вече е `next start`, а не `npm run bot`.
4. Повече от една replica може да стартира повече от един bot/scheduler.
5. `src/scheduler.ts` прави database query всяка минута.
6. Няма atomic claim/lock на reminder преди изпращане. Два scheduler-а могат да изпратят едно и също напомняне.
7. Tick-овете могат да се застъпят, ако обработката отнеме повече от минута.
8. Всеки due reminder прави отделен LLM call.

### Проблеми в напомнянията

1. Доставката е само Telegram: `if (!r.telegramId) continue`.
2. Web-only потребител може да има reminders в dashboard-а, но никога да не ги получи.
3. `generateReminderMessage()` винаги използва morning prompt, включително за вечерни напомняния.
4. `settings.checkin`, `morningCheckin` и `eveningCheckin` практически не управляват scheduler-а.
5. README споменава `/checkins on|off`, но такава команда не е имплементирана.
6. При onboarding автоматично се създават 08:00 и 21:00 reminders, преди да е потвърден предпочитаният канал.
7. Валидирането на часа приема формати като `99:99`; timezone също не се валидира като IANA timezone.
8. Няма quiet hours, snooze, skip today или контрол на честотата.

### Проблеми в коучинг потока и паметта

1. `saveExtractedProfile()` не записва `vision` и `focus`, въпреки че prompt-ът ги извлича.
2. Извлечените habits губят `kind` и `trigger`.
3. Финализирането може да създава дублирани habits вместо да използва съществуващия upsert.
4. `lc_check_ins` съществува, но няма код, който да я използва.
5. `recentSummary` съществува в `buildContext()`, но не се подава.
6. Дългите разговори разчитат само на последните съобщения и постепенно губят стар контекст.
7. `short` session се предлага от модела, но бутонът стартира същата deep session.
8. Admin полето `prompts.base` не се включва автоматично в runtime prompt composition.
9. `executedCalls` се събират от LLM слоя, но не се пазят за audit или debugging.
10. `/reset` започва нова ориентация, но не нулира ясно профила, habits, reminders и sessions.
11. При Telegram/web merge не се мигрират всички свързани данни, например reminders, sessions и check-ins.
12. Няма structured output/schema validation за JSON extraction; използва се директен `JSON.parse`.

### Сигурност и контрол на разходите

1. Регистрацията е публична.
2. Telegram ботът е достъпен за всеки, който намери username-а му.
3. Няма rate limiting на register, login и chat.
4. Няма дневен или месечен token budget по user.
5. Admin ролята се пази в JWT до 30 дни; отнемане на admin права в базата не обезсилва веднага вече издадения cookie.
6. Link code използва `Math.random()`, а endpoint-ът няма brute-force rate limit.
7. Няма account deletion, export, retention policy, privacy policy или terms.
8. Разговорите се изпращат към външни LLM доставчици, което трябва да е ясно обяснено на потребителя.
9. Грешките от chat API могат да върнат вътрешния `err.message` към клиента.

### Качество и наблюдаемост

1. Няма unit, integration или end-to-end tests.
2. Няма eval suite за поведението на коуча.
3. Няма lint script.
4. Цените на моделите са hardcoded и с времето могат да станат неточни.
5. Няма fallback модел при временна грешка или rate limit.
6. Няма streaming в web chat.
7. Dashboard-ът брои съобщения и сесии, но не показва реално изпълнение на навици и цели.

## 7. Как да стане коучът по-полезен

### Важно уточнение за NLP

Проектът вече използва класически NLP идеи като субмодалности, VAK, асоцииране и дисоцииране. Част от тези техники нямат силна научна подкрепа и не трябва да се представят като терапия или гарантирано психологическо лечение.

По-надежден продукт ще комбинира coaching подходи с по-добре изследвани практики:

- Motivational Interviewing: отразяване, автономия, работа с амбивалентност;
- GROW: Goal, Reality, Options, Will;
- WOOP: Wish, Outcome, Obstacle, Plan;
- implementation intentions: „Ако X, тогава ще направя Y“;
- habit design: тригер, минимално действие, награда, среда;
- values clarification от ACT, без претенции за терапия;
- cognitive reframing, ясно означено като coaching reflection;
- self-compassion и relapse planning;
- weekly review и accountability.

### 7.1 Safety слой — първи приоритет

Трябва да има общ safety prompt и server-side risk handling за:

- самонараняване или самоубийство;
- насилие и непосредствена опасност;
- психоза, тежка дисоциация или мания;
- хранителни разстройства;
- медицински, правни или финансови решения;
- trauma content, преди упражнения със затваряне на очи и силна визуализация.

При висок риск:

- да не се стартира deep NLP упражнение;
- да се покаже кратък, човешки и предварително проверен отговор;
- да се насочи към 112 при непосредствена опасност;
- да се предложи контакт с доверен човек и квалифициран специалист;
- да не се оставя критичният отговор изцяло на генеративния модел.

### 7.2 Реални режими на разговор

Добре е да има три ясни формата:

1. 2–5 минути: check-in
   - настроение/енергия;
   - какво е най-важно днес;
   - една микро-стъпка;
   - optional reminder.
2. 10–15 минути: clarity session
   - конкретен въпрос;
   - GROW или WOOP;
   - решение и commitment.
3. 25–40 минути: deep session
   - договор за целта на сесията;
   - подходяща техника;
   - insight;
   - една следваща стъпка;
   - follow-up.

Това ще направи `short` и `deep` реално различни.

### 7.3 Цели, стъпки и accountability

Профилът в свободен текст не е достатъчен за измерим прогрес. Предлагам отделни структури:

- `lc_goals`
  - title;
  - why;
  - desired outcome;
  - success criteria;
  - target date;
  - status.
- `lc_action_steps`
  - goal ID;
  - description;
  - due date;
  - status;
  - difficulty;
  - reminder ID.
- използване на съществуващата `lc_check_ins`
  - done, partial, missed;
  - note;
  - причина/пречка;
  - следваща корекция.
- `lc_weekly_reviews`
  - wins;
  - obstacles;
  - lessons;
  - next focus.

Нови tools за коуча:

- `set_goal`
- `create_action_step`
- `complete_action_step`
- `log_checkin`
- `snooze_reminder`
- `start_weekly_review`
- `update_user_preferences`

### 7.4 По-добра дългосрочна памет

Преди vector database е достатъчна по-проста схема:

1. Rolling summary след определен брой съобщения.
2. Отделно:
   - устойчиви факти;
   - текущ фокус;
   - активни commitments;
   - скорошни пречки;
   - предпочитан стил на коучинг.
3. В prompt-а да влиза само релевантният контекст.
4. Потребителят да може да види, редактира и изтрие какво се помни.

Embeddings/RAG могат да се добавят по-късно, ако реално има много дълги истории. Не са нужни за първата подобрена версия.

### 7.5 Персонализация

Настройки, които потребителят трябва да контролира:

- тон: мек, директен, предизвикващ;
- дължина на отговорите;
- предпочитан час и timezone;
- дни без известия;
- quiet hours;
- теми, които не желае;
- дали коучът да предлага deep sessions;
- preferred framework;
- reminder style;
- език.

### 7.6 Измерване на качеството

Нужен е малък eval набор с анонимни фиктивни сценарии:

- първи контакт;
- неясна цел;
- пропуснат навик;
- повтарящо се отлагане;
- силна емоция без криза;
- crisis сигнал;
- искане за медицински съвет;
- създаване/промяна/изтриване на reminder;
- short session;
- deep session;
- memory recall;
- prompt injection от потребител.

За всеки сценарий се оценяват:

- безопасност;
- полезност;
- един въпрос наведнъж;
- правилно tool calling;
- липса на измислени спомени;
- конкретна следваща стъпка;
- цена и latency.

## 8. Препоръчан минимален продукт

За да не стане прекалено сложен, първата подобрена версия трябва да включва само:

1. Уеб приложение във Vercel.
2. Neon база със scale-to-zero.
3. PWA install.
4. Web Push reminders.
5. QStash schedules.
6. Daily check-in, short session и deep session.
7. Структурирани goals/action steps/check-ins.
8. Safety слой.
9. Rate limits и invite-only режим, докато продуктът е в тест.
10. Dashboard за прогрес и контрол на напомнянията.

Да не се добавят още:

- React Native/Expo приложение;
- сложен vector database;
- voice calls;
- multi-agent система;
- социална мрежа;
- marketplace за коучове;
- директен APK pipeline преди стабилна PWA.

## 9. Roadmap

### Фаза 0 — спиране на неясните разходи

- Проверка на Railway, Neon, OpenAI, Anthropic и GitHub invoices.
- Backup/export на `lc_*` таблиците.
- Проверка дали Neon базата се използва от други проекти.
- Спиране на ненужните Railway services.
- Revocation на стари API keys и създаване на spending limits.
- Решение дали Telegram остава активен.

Резултат: няма неизвестни активни услуги.

### Фаза 1 — стабилен web deploy

- Премахване на production side effect-а от `instrumentation.ts` или защитаването му с изричен feature flag.
- Deploy на Next.js във Vercel.
- Корекция на README и env документацията.
- Invite-only registration.
- Rate limiting на auth и chat.
- Еднаква server-side admin проверка срещу базата.
- Error sanitization.

Резултат: работещ сайт без Telegram dependency и без постоянен worker.

### Фаза 2 — PWA и mobile UX

- Manifest и app icons.
- Service worker shell.
- Install CTA и инструкции за Android/iOS.
- Mobile bottom navigation.
- `100dvh` и safe-area корекции в чата.
- Settings екран за timezone, напомняния и notification permissions.

Резултат: сайтът се инсталира и се усеща като приложение.

### Фаза 3 — Web Push reminders

- `lc_push_subscriptions`.
- VAPID config.
- Subscribe/unsubscribe flow.
- QStash integration.
- Signed webhook verification.
- Schedule ID върху reminder.
- Retry и invalid subscription cleanup.
- Quiet hours и snooze.
- Шаблонни reminder съобщения или генериране веднъж при създаване.

Резултат: надеждни известия без Telegram и без always-on server.

### Фаза 4 — коучинг качество и safety

- Safety policy и crisis flow.
- Поправка на profile extraction.
- Реален short session mode.
- Goals/action steps/check-ins.
- Weekly review.
- Rolling summaries.
- User-editable memory.
- Eval suite.

Резултат: коучът следи реална промяна, не само води разговор.

### Фаза 5 — optional Android package

- TWA с Bubblewrap.
- Digital Asset Links.
- Privacy policy и account deletion.
- Internal testing.
- Google Play AAB.
- По желание signed APK download.

Резултат: store приложение без втори UI codebase.

## 10. Решения, които трябва да вземем

1. Проектът личен ли ще остане, или ще се предлага публично/платено?
2. Искаш ли Telegram да бъде:
   - изцяло премахнат;
   - временно изключен, но запазен в кода;
   - преработен към webhook и оставен като втори канал?
3. Основните потребители само на Android ли са, или трябва да поддържаме и iPhone?
4. Колко точни трябва да са напомнянията: до минута, до 5 минути или е достатъчен сутрешен/вечерен прозорец?
5. Какъв месечен бюджет е приемлив за hosting и LLM?
6. Искаш ли регистрацията временно да бъде само с покана?
7. Българският ли остава единственият език?
8. Искаш ли коучът да е по-мек или по-директен и accountability-oriented?
9. Кои са трите най-важни казуса, които трябва да решава отлично?
10. Искаш ли потребителят да вижда и редактира „какво коучът помни за мен“?
11. Трябва ли да има export/delete account още в първата публична версия?
12. Имаш ли достъп до старите Railway и Neon dashboards, за да се установи точната такса?

## 11. Моето конкретно предложение за следваща итерация

Първата реална итерация да бъде:

1. Установяване и спиране на старите разходи.
2. Подготовка за Vercel без Telegram side effects.
3. Поправка на най-важните data bugs и добавяне на safety слой.
4. PWA install.
5. Web Push с QStash.
6. Check-ins и short sessions.
7. Едва след това optional APK/TWA.

Така проектът остава сравнително прост: един Next.js codebase, една Postgres база и serverless услуги, които се активират само при реално събитие.

## 12. Официални източници

- Vercel Cron usage and limits:
  https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel Function duration limits:
  https://vercel.com/docs/functions/configuring-functions/duration
- Vercel Hobby plan:
  https://vercel.com/docs/plans/hobby
- Neon scale-to-zero:
  https://neon.com/docs/introduction/scale-to-zero
- Neon plans and billing:
  https://neon.com/docs/introduction/plans
- Railway pricing:
  https://railway.com/pricing
- QStash schedules:
  https://upstash.com/docs/qstash/features/schedules
- Cross-browser Web Push:
  https://web.dev/blog/push-notifications-in-all-modern-browsers
- PWA installation:
  https://web.dev/learn/pwa/installation
- Android Trusted Web Activities:
  https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities
- Bubblewrap/TWA quick start:
  https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2
- GitHub Actions billing:
  https://docs.github.com/en/billing/concepts/product-billing/github-actions
