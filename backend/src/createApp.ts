import cors from "cors";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { authRouter } from "./routes/auth.js";
import { apiRouter } from "./routes/api.js";
import { analyticsRouter } from "./routes/analytics.js";
import { instrumentsRouter } from "./routes/instruments.js";
import { technicalsRouter } from "./routes/technicals.js";
import { getPublicAppUrl, shouldServeFrontend } from "./config/publicUrl.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(): express.Application {
  const app = express();
  const publicUrl = getPublicAppUrl();

  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(
    cors({
      origin: publicUrl,
      credentials: true,
    }),
  );
  app.use(express.json());

  app.use((req, res, next) => {
    const cookieHeader = req.headers.cookie ?? "";
    req.cookies = Object.fromEntries(
      cookieHeader.split(";").map((part) => {
        const [key, ...rest] = part.trim().split("=");
        return [key, decodeURIComponent(rest.join("="))];
      }).filter(([key]) => key),
    ) as Record<string, string>;
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", app: "tradescharge", publicUrl });
  });

  app.use("/auth", authRouter);
  app.use("/api/instruments", instrumentsRouter);
  app.use("/api/technicals", technicalsRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api", apiRouter);

  if (shouldServeFrontend()) {
    const distDir = path.resolve(__dirname, "../../frontend/dist");
    if (fs.existsSync(path.join(distDir, "index.html"))) {
      app.use(express.static(distDir, { index: false, maxAge: "1h" }));
      app.get("*", (req, res, next) => {
        if (req.method !== "GET") {
          next();
          return;
        }
        if (req.path.startsWith("/api") || req.path.startsWith("/auth")) {
          next();
          return;
        }
        res.sendFile(path.join(distDir, "index.html"));
      });
    } else {
      console.warn(`SERVE_FRONTEND enabled but missing ${distDir} — run npm run build`);
    }
  }

  return app;
}
