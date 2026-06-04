import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Потребители — общи за Telegram и уеб сайта. telegram_id и email са nullable
// поотделно, така че профил може да съществува само в Telegram, само в уеб,
// или свързан и в двете (чрез /link код).
export const usersTable = pgTable("lc_users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  telegramId: bigint("telegram_id", { mode: "number" }).unique(),
  email: varchar({ length: 255 }).unique(),
  passwordHash: text("password_hash"),
  isAdmin: boolean("is_admin").notNull().default(false),
  name: varchar({ length: 255 }),
  // 'new' (още нищо) | 'interview' (тече опознавателна сесия) | 'done'
  onboardingStage: varchar("onboarding_stage", { length: 20 })
    .notNull()
    .default("new"),
  // Включени ли са проактивните check-in-и
  morningCheckin: boolean("morning_checkin").notNull().default(true),
  eveningCheckin: boolean("evening_checkin").notNull().default(true),
  // 'idle' (нормален режим) | 'deep' (тече дълбока сесия)
  mode: varchar({ length: 20 }).notNull().default("idle"),
  // Часова зона на потребителя — за персоналните напомняния.
  timezone: varchar({ length: 64 }).notNull().default("Europe/Sofia"),
  lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Профил / "кой си и кой искаш да станеш" — резултатът от опознаването.
// Свободен текст; попълва се и се обновява от коуча.
export const profilesTable = pgTable("lc_profiles", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  identityCurrent: text("identity_current").notNull().default(""),
  identityTarget: text("identity_target").notNull().default(""),
  beliefsLimiting: text("beliefs_limiting").notNull().default(""),
  beliefsNew: text("beliefs_new").notNull().default(""),
  story: text().notNull().default(""),
  problems: text().notNull().default(""),
  goals: text().notNull().default(""),
  // Богата визия за желаното бъдеще (текущо->желано състояние).
  vision: text().notNull().default(""),
  // Върху какво се фокусира човекът сега: 'habits' | 'goals' | 'beliefs' | 'identity'
  focus: varchar({ length: 40 }).notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Навиците, които градим (няколко, обвързани с новата идентичност)
export const habitsTable = pgTable("lc_habits", {
  id: uuid().primaryKey().defaultRandom(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: varchar({ length: 300 }).notNull(),
  // 'build' (навик, който градим) | 'limiting' (ограничаващ/негативен навик)
  kind: varchar({ length: 20 }).notNull().default("build"),
  // За ограничаващите навици: тригерът/моментът, който ги предизвиква.
  trigger: text().notNull().default(""),
  // С коя идентичност/вярване е свързан навикът
  identityLink: text("identity_link").notNull().default(""),
  // Свободен текст: напр. "всеки ден", "пн/ср/пт"
  cadence: varchar({ length: 100 }).notNull().default("всеки ден"),
  active: boolean().notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Дневни отчитания (accountability)
export const checkInsTable = pgTable("lc_check_ins", {
  id: uuid().primaryKey().defaultRandom(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  habitId: uuid("habit_id").references(() => habitsTable.id, {
    onDelete: "cascade",
  }),
  // 'done' | 'partial' | 'missed'
  status: varchar({ length: 20 }).notNull(),
  note: text(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Сесии — отделни, видими "срещи" (опознаване / дълбока работа). Ежедневният
// чат не е сесия (session_id = null върху съобщенията).
export const sessionsTable = pgTable("lc_sessions", {
  id: uuid().primaryKey().defaultRandom(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // 'onboarding' | 'deep'
  type: varchar({ length: 20 }).notNull().default("deep"),
  title: varchar({ length: 300 }).notNull().default(""),
  // Тема/фокус на сесията: 'habits' | 'goals' | 'beliefs' | 'identity' | ...
  focus: varchar({ length: 40 }).notNull().default(""),
  // 'active' | 'completed'
  status: varchar({ length: 20 }).notNull().default("active"),
  summary: text().notNull().default(""),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
});

// Пълен дневник на разговорите (памет) + телеметрия за модел/токени/цена.
export const messagesTable = pgTable("lc_messages", {
  id: uuid().primaryKey().defaultRandom(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // Към коя сесия принадлежи (null = ежедневен чат поток).
  sessionId: uuid("session_id").references(() => sessionsTable.id, {
    onDelete: "set null",
  }),
  // 'user' | 'assistant'
  role: varchar({ length: 20 }).notNull(),
  content: text().notNull(),
  // 'chat' | 'checkin' | 'deep' | 'onboarding'
  kind: varchar({ length: 20 }).notNull().default("chat"),
  // Телеметрия (попълва се за asistant съобщенията).
  model: varchar({ length: 64 }).notNull().default(""),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  costUsd: doublePrecision("cost_usd").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Персонални динамични напомняния — раждат се от разговора, различни за всеки.
export const remindersTable = pgTable("lc_reminders", {
  id: uuid().primaryKey().defaultRandom(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // Локално време "HH:MM" (спрямо часовата зона на потребителя).
  time: varchar({ length: 5 }).notNull(),
  // Дни: "*" (всеки ден) или "mon,wed,fri".
  days: varchar({ length: 40 }).notNull().default("*"),
  // Кратка тема (напр. "медитация", "вечерен преглед").
  reason: varchar({ length: 200 }).notNull().default(""),
  // Насока към коуча какво да съдържа съобщението.
  promptHint: text("prompt_hint").notNull().default(""),
  active: boolean().notNull().default(true),
  // Дата "YYYY-MM-DD", на която последно е изпратено (за дедупликация).
  lastSentOn: varchar("last_sent_on", { length: 10 }).notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Прозрения от дълбоките сесии — "тайното оръжие" на паметта
export const insightsTable = pgTable("lc_insights", {
  id: uuid().primaryKey().defaultRandom(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  content: text().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Кодове за свързване на Telegram акаунт с уеб профил (или за magic-link вход).
// Кратък срок на валидност; еднократна употреба.
export const linkCodesTable = pgTable("lc_link_codes", {
  code: varchar({ length: 16 }).primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // 'link' (за свързване с уеб профил) | 'login' (за magic-link вход)
  purpose: varchar({ length: 20 }).notNull().default("link"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Глобални настройки на бота (промпти, модели, разписание). Един ред (key='main').
// Стойностите се сливат с DEFAULT_SETTINGS в src/core/settings.ts при четене.
export const settingsTable = pgTable("lc_settings", {
  key: varchar({ length: 32 }).primaryKey(),
  data: jsonb().notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type Profile = typeof profilesTable.$inferSelect;
export type Habit = typeof habitsTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
export type Reminder = typeof remindersTable.$inferSelect;
