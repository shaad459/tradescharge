import type { Request, Response, NextFunction } from "express";

function readAdminKey(req: Request): string | undefined {
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (auth) {
    return auth;
  }
  const query = req.query.key;
  if (typeof query === "string") {
    return query;
  }
  return undefined;
}

export function isValidAdminKey(key: string | undefined): boolean {
  const expected = process.env.ANALYTICS_ADMIN_KEY?.trim();
  return Boolean(expected && key && key === expected);
}

export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  if (!process.env.ANALYTICS_ADMIN_KEY?.trim()) {
    return res.status(503).json({
      error: "Admin dashboard disabled. Set ANALYTICS_ADMIN_KEY in backend .env and restart.",
    });
  }

  if (!isValidAdminKey(readAdminKey(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}
