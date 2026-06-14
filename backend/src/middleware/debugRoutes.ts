import type { Request, Response, NextFunction } from "express";
import { areDebugRoutesEnabled } from "../config/security.js";

export function requireDebugRoutes(_req: Request, res: Response, next: NextFunction) {
  if (!areDebugRoutesEnabled()) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
}
