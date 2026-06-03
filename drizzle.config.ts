import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // ВАЖНО: базата се споделя с друг проект. Ограничаваме drizzle само до нашите
  // таблици (префикс lc_), за да не докосне/изтрие чуждите таблици.
  tablesFilter: ["lc_*"],
});
