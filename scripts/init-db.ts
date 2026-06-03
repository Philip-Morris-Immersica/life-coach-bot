import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/db/index";

// Създава таблиците на коуча (префикс lc_) в съществуващата Neon база,
// без да пипа таблиците на другите проекти. Идемпотентно (IF NOT EXISTS,
// ADD COLUMN IF NOT EXISTS, DROP NOT NULL).
const statements = [
  // --- Основни таблици ---
  `CREATE TABLE IF NOT EXISTS lc_users (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_id bigint UNIQUE,
    email varchar(255) UNIQUE,
    password_hash text,
    is_admin boolean NOT NULL DEFAULT false,
    name varchar(255),
    onboarding_stage varchar(20) NOT NULL DEFAULT 'new',
    morning_checkin boolean NOT NULL DEFAULT true,
    evening_checkin boolean NOT NULL DEFAULT true,
    mode varchar(20) NOT NULL DEFAULT 'idle',
    last_active_at timestamp NOT NULL DEFAULT now(),
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  // Миграция за бази, в които lc_users е създадена със стария scheme
  // (telegram_id NOT NULL, без email/password/is_admin).
  `ALTER TABLE lc_users ALTER COLUMN telegram_id DROP NOT NULL`,
  `ALTER TABLE lc_users ADD COLUMN IF NOT EXISTS email varchar(255) UNIQUE`,
  `ALTER TABLE lc_users ADD COLUMN IF NOT EXISTS password_hash text`,
  `ALTER TABLE lc_users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false`,

  `CREATE TABLE IF NOT EXISTS lc_profiles (
    user_id integer PRIMARY KEY REFERENCES lc_users(id) ON DELETE CASCADE,
    identity_current text NOT NULL DEFAULT '',
    identity_target text NOT NULL DEFAULT '',
    beliefs_limiting text NOT NULL DEFAULT '',
    beliefs_new text NOT NULL DEFAULT '',
    story text NOT NULL DEFAULT '',
    problems text NOT NULL DEFAULT '',
    goals text NOT NULL DEFAULT '',
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS lc_habits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id integer NOT NULL REFERENCES lc_users(id) ON DELETE CASCADE,
    name varchar(300) NOT NULL,
    identity_link text NOT NULL DEFAULT '',
    cadence varchar(100) NOT NULL DEFAULT 'всеки ден',
    active boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS lc_check_ins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id integer NOT NULL REFERENCES lc_users(id) ON DELETE CASCADE,
    habit_id uuid REFERENCES lc_habits(id) ON DELETE CASCADE,
    status varchar(20) NOT NULL,
    note text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS lc_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id integer NOT NULL REFERENCES lc_users(id) ON DELETE CASCADE,
    role varchar(20) NOT NULL,
    content text NOT NULL,
    kind varchar(20) NOT NULL DEFAULT 'chat',
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS lc_insights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id integer NOT NULL REFERENCES lc_users(id) ON DELETE CASCADE,
    content text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`,

  // --- Нови таблици за уеб + админ ---
  `CREATE TABLE IF NOT EXISTS lc_link_codes (
    code varchar(16) PRIMARY KEY,
    user_id integer NOT NULL REFERENCES lc_users(id) ON DELETE CASCADE,
    purpose varchar(20) NOT NULL DEFAULT 'link',
    expires_at timestamp NOT NULL,
    used_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS lc_settings (
    key varchar(32) PRIMARY KEY,
    data jsonb NOT NULL,
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
];

async function main() {
  for (const stmt of statements) {
    try {
      await db.execute(sql.raw(stmt));
      console.log("OK:", stmt.split("\n")[0].trim().slice(0, 80));
    } catch (err: any) {
      // ALTER COLUMN DROP NOT NULL дава грешка ако колоната вече е nullable —
      // безопасно е да го игнорираме при идемпотентен пуск.
      if (err?.code === "42P07" || err?.code === "42710") {
        console.log("SKIP (already exists):", stmt.split("\n")[0].slice(0, 80));
      } else if (
        err?.message?.includes("is already") ||
        err?.message?.includes("not null")
      ) {
        console.log("SKIP:", stmt.split("\n")[0].slice(0, 80));
      } else {
        throw err;
      }
    }
  }
  console.log("Готово — всички lc_ таблици/колони са синхронизирани.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Грешка:", err);
    process.exit(1);
  });
