import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log("Стартиране на миграция...");

  // 1. Липсващи колони в lc_users
  await sql`ALTER TABLE lc_users ADD COLUMN IF NOT EXISTS timezone varchar(64) NOT NULL DEFAULT 'Europe/Sofia'`;
  await sql`ALTER TABLE lc_users ADD COLUMN IF NOT EXISTS last_active_at timestamp NOT NULL DEFAULT now()`;
  await sql`ALTER TABLE lc_users ADD COLUMN IF NOT EXISTS password_hash text`;
  await sql`ALTER TABLE lc_users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false`;
  await sql`ALTER TABLE lc_users ADD COLUMN IF NOT EXISTS mode varchar(20) NOT NULL DEFAULT 'idle'`;
  await sql`ALTER TABLE lc_users ADD COLUMN IF NOT EXISTS morning_checkin boolean NOT NULL DEFAULT true`;
  await sql`ALTER TABLE lc_users ADD COLUMN IF NOT EXISTS evening_checkin boolean NOT NULL DEFAULT true`;
  await sql`ALTER TABLE lc_users ADD COLUMN IF NOT EXISTS onboarding_stage varchar(20) NOT NULL DEFAULT 'new'`;
  console.log("✓ lc_users колони");

  // 2. lc_sessions
  await sql`
    CREATE TABLE IF NOT EXISTS lc_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id integer NOT NULL REFERENCES lc_users(id) ON DELETE CASCADE,
      type varchar(20) NOT NULL DEFAULT 'deep',
      title varchar(300) NOT NULL DEFAULT '',
      focus varchar(40) NOT NULL DEFAULT '',
      status varchar(20) NOT NULL DEFAULT 'active',
      summary text NOT NULL DEFAULT '',
      started_at timestamp NOT NULL DEFAULT now(),
      ended_at timestamp
    )
  `;
  console.log("✓ lc_sessions");

  // 3. session_id колона в lc_messages (ако липсва)
  await sql`ALTER TABLE lc_messages ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES lc_sessions(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE lc_messages ADD COLUMN IF NOT EXISTS kind varchar(20) NOT NULL DEFAULT 'chat'`;
  await sql`ALTER TABLE lc_messages ADD COLUMN IF NOT EXISTS model varchar(64) NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE lc_messages ADD COLUMN IF NOT EXISTS prompt_tokens integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE lc_messages ADD COLUMN IF NOT EXISTS completion_tokens integer NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE lc_messages ADD COLUMN IF NOT EXISTS cost_usd double precision NOT NULL DEFAULT 0`;
  console.log("✓ lc_messages колони");

  // 4. lc_reminders
  await sql`
    CREATE TABLE IF NOT EXISTS lc_reminders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id integer NOT NULL REFERENCES lc_users(id) ON DELETE CASCADE,
      time varchar(5) NOT NULL,
      days varchar(40) NOT NULL DEFAULT '*',
      reason varchar(200) NOT NULL DEFAULT '',
      prompt_hint text NOT NULL DEFAULT '',
      active boolean NOT NULL DEFAULT true,
      last_sent_on varchar(10) NOT NULL DEFAULT '',
      created_at timestamp NOT NULL DEFAULT now()
    )
  `;
  console.log("✓ lc_reminders");

  // 5. lc_link_codes
  await sql`
    CREATE TABLE IF NOT EXISTS lc_link_codes (
      code varchar(16) PRIMARY KEY,
      user_id integer NOT NULL REFERENCES lc_users(id) ON DELETE CASCADE,
      purpose varchar(20) NOT NULL DEFAULT 'link',
      expires_at timestamp NOT NULL,
      used_at timestamp,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `;
  console.log("✓ lc_link_codes");

  // 6. lc_settings
  await sql`
    CREATE TABLE IF NOT EXISTS lc_settings (
      key varchar(32) PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `;
  console.log("✓ lc_settings");

  // 7. lc_profiles — добави липсващи колони
  await sql`ALTER TABLE lc_profiles ADD COLUMN IF NOT EXISTS vision text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE lc_profiles ADD COLUMN IF NOT EXISTS focus varchar(40) NOT NULL DEFAULT ''`;
  console.log("✓ lc_profiles колони");

  // 8. lc_habits — добави липсващи колони
  await sql`ALTER TABLE lc_habits ADD COLUMN IF NOT EXISTS kind varchar(20) NOT NULL DEFAULT 'build'`;
  await sql`ALTER TABLE lc_habits ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE lc_habits ADD COLUMN IF NOT EXISTS identity_link text NOT NULL DEFAULT ''`;
  console.log("✓ lc_habits колони");

  console.log("\n✅ Миграцията завърши успешно!");
}

migrate().catch((e) => {
  console.error("❌ Грешка при миграция:", e);
  process.exit(1);
});
