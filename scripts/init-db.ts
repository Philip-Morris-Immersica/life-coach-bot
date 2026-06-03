import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/db/index.js";

// Създава таблиците на коуча (префикс lc_) в съществуващата Neon база,
// без да пипа таблиците на другите проекти. Идемпотентно (IF NOT EXISTS).
const statements = [
  `CREATE TABLE IF NOT EXISTS lc_users (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_id bigint NOT NULL UNIQUE,
    name varchar(255),
    onboarding_stage varchar(20) NOT NULL DEFAULT 'new',
    morning_checkin boolean NOT NULL DEFAULT true,
    evening_checkin boolean NOT NULL DEFAULT true,
    mode varchar(20) NOT NULL DEFAULT 'idle',
    last_active_at timestamp NOT NULL DEFAULT now(),
    created_at timestamp NOT NULL DEFAULT now()
  )`,
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
];

async function main() {
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt));
    console.log("OK:", stmt.split("(")[0].trim());
  }
  console.log("Готово — всички lc_ таблици са създадени.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Грешка:", err);
    process.exit(1);
  });
