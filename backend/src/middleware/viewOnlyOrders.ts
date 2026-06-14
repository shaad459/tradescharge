import type { Request, Response, NextFunction } from "express";
import { isViewOnly } from "../config/viewOnly.js";

export function blockOrdersInViewOnly(_req: Request, res: Response, next: NextFunction) {
  if (isViewOnly()) {
    return res.status(403).json({
      error: "Tradescharge is view-only. Place and cancel orders on Kite.",
    });
  }
  next();
}
