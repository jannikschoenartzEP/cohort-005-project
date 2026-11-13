import { existsSync } from "node:fs";

// ─── Environment ───
// Loads .env into process.env once, when the file exists (no dotenv).
// Variables already set in the environment win. Import this module before
// reading process.env.

if (existsSync(".env")) {
  process.loadEnvFile(".env");
}
