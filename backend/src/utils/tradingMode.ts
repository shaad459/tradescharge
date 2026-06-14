import type { Request } from "express";
import { isViewOnly } from "../config/viewOnly.js";
import { SESSION_COOKIE } from "../config/security.js";
import { getSession, getSessionById } from "../services/sessionManager.js";

export type TradingMode = "demo" | "live";

export function getTradingMode(req: Request): TradingMode {
  const cookie = req.cookies?.tc_trading_mode as string | undefined;
  if (cookie === "demo" || cookie === "live") {
    return cookie;
  }

  const sessionId = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (getSessionById(sessionId, req)) {
    return "live";
  }

  return "demo";
}

/** View-only + Kite session always streams live positions (ignore stale demo cookie). */
export function resolveTradingMode(req: Request): TradingMode {
  const sessionId = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const session = getSessionById(sessionId, req);
  if (isViewOnly() && session?.accessToken) {
    return "live";
  }
  return getTradingMode(req);
}

export function shouldStreamLive(userId: string | undefined, tradingMode: TradingMode): boolean {
  if (!userId) {
    return false;
  }
  const session = getSession(userId);
  if (!session?.accessToken) {
    return false;
  }
  if (isViewOnly()) {
    return true;
  }
  return tradingMode === "live";
}

export function hasKiteSession(req: Request): boolean {
  const session = getSessionById(req.cookies?.[SESSION_COOKIE] as string | undefined, req);
  return Boolean(session?.accessToken);
}
