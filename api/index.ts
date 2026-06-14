import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createApp } from "../backend/src/createApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

process.env.NODE_ENV ??= "production";
process.env.VERCEL ??= "1";
process.env.STATELESS_SESSIONS ??= "1";
process.env.COOKIE_SECURE ??= "true";
process.env.TRADESCHARGE_DATA_DIR ??= "/tmp/tradescharge";

const app = createApp();
export default app;

/** Vercel Pro: longer SSE / market-context fetches; Hobby caps at 10s. */
export const config = {
  maxDuration: 60,
};
