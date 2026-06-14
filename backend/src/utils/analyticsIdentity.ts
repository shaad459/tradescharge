import type { Request, Response } from "express";
import crypto from "crypto";

const VISITOR_COOKIE = "tc_vid";
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function newVisitorId(): string {
  return crypto.randomUUID();
}

function isValidVisitorId(value: string | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

/** Prefer stable client id (localStorage); keep cookie in sync. */
export function resolveVisitorId(
  req: Request,
  res: Response,
  clientVisitorId?: string,
): string {
  const fromClient = isValidVisitorId(clientVisitorId) ? clientVisitorId : undefined;
  const fromCookie = req.cookies?.[VISITOR_COOKIE] as string | undefined;
  const visitorId = fromClient ?? (isValidVisitorId(fromCookie) ? fromCookie : newVisitorId());

  if (fromCookie !== visitorId) {
    res.setHeader(
      "Set-Cookie",
      `${VISITOR_COOKIE}=${encodeURIComponent(visitorId)}; Path=/; Max-Age=${Math.floor(COOKIE_MAX_AGE_MS / 1000)}; SameSite=Lax`,
    );
  }

  return visitorId;
}
