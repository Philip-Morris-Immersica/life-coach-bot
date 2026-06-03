import {
  bigint,
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Потребители (по един ред на Telegram акаунт)
export const usersTable = pgTable("lc_users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
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
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Навиците, които градим (няколко, обвързани с новата идентичност)
export const habitsTable = pgTable("lc_habits", {
  id: uuid().primaryKey().defaultRandom(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: varchar({ length: 300 }).notNull(),
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

// Пълен дневник на разговорите (памет)
export const messagesTable = pgTable("lc_messages", {
  id: uuid().primaryKey().defaultRandom(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // 'user' | 'assistant'
  role: varchar({ length: 20 }).notNull(),
  content: text().notNull(),
  // 'chat' | 'checkin' | 'deep' | 'onboarding'
  kind: varchar({ length: 20 }).notNull().default("chat"),
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

export type User = typeof usersTable.$inferSelect;
export type Profile = typeof profilesTable.$inferSelect;
export type Habit = typeof habitsTable.$inferSelect;
