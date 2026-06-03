import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("Липсва DATABASE_URL в .env");
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });

// Експлицитен ре-експорт за по-добра съвместимост с bundler-и (Turbopack)
// в сравнение с `export * from ...`.
export {
  usersTable,
  profilesTable,
  habitsTable,
  checkInsTable,
  messagesTable,
  insightsTable,
  linkCodesTable,
  settingsTable,
} from "./schema";

export type { User, Profile, Habit } from "./schema";
