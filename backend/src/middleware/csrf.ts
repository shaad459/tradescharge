import type { Request, Response, NextFunction } from "express";
import { validateCsrf } from "../services/sessionManager.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Require CSRF token on state-changing API calls (cookie + X-CSRF-Token header). */
export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  if (!validateCsrf(req)) {
    return res.status(403).json({
      error: "Invalid or missing CSRF token. Refresh the page and try again.",
    });
  }

  next();
}
