import { createHash, createHmac, randomBytes } from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { Request, Response } from "express";
import {
  CSRF_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SEC,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  useSecureCookies,
} from "../config/security.js";
import { decryptJson, decryptJsonSync, encryptJson, encryptJsonSync } from "./sessionCrypto.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = process.env.TRADESCHARGE_DATA_DIR?.trim()
  ? path.resolve(process.env.TRADESCHARGE_DATA_DIR.trim())
  : path.resolve(__dirname, "../../data");
const ENCRYPTED_STORE = path.join(DATA_ROOT, "kite-sessions.enc.json");
const LEGACY_STORE = path.join(DATA_ROOT, "kite-session.json");
const SESSION_BLOB_COOKIE = "tc_sess";

/** Encrypted session cookie — required on Vercel/serverless (no shared disk). */
export function useStatelessSessions(): boolean {
  return (
    process.env.VERCEL === "1" ||
    process.env.STATELESS_SESSIONS === "1" ||
    process.env.STATELESS_SESSIONS === "true"
  );
}

export interface AppSession {
  sessionId: string;
  userId: string;
  accessToken: string;
  csrfToken: string;
  auditKey: string;
  createdAt: number;
  expiresAt: number;
}

const sessionsById = new Map<string, AppSession>();
const oauthStates = new Map<string, number>();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function cookieSuffix(): string {
  const secure = useSecureCookies() ? "; Secure" : "";
  return `; SameSite=Lax; Path=/${secure}`;
}

function buildAuditKey(userId: string): string {
  const secret = process.env.SESSION_SECRET ?? "local-dev-audit-key";
  return createHmac("sha256", secret).update(userId).digest("hex").slice(0, 24);
}

function newSessionId(): string {
  return randomBytes(32).toString("hex");
}

function newCsrfToken(): string {
  return randomBytes(24).toString("hex");
}

function isExpired(session: AppSession): boolean {
  return Date.now() > session.expiresAt;
}

function pruneExpired(): void {
  for (const [id, session] of sessionsById) {
    if (isExpired(session)) {
      sessionsById.delete(id);
    }
  }
  const now = Date.now();
  for (const [state, created] of oauthStates) {
    if (now - created > OAUTH_STATE_TTL_MS) {
      oauthStates.delete(state);
    }
  }
}

async function persistSessions(): Promise<void> {
  pruneExpired();
  const payload = {
    version: 2,
    sessions: [...sessionsById.values()].map((session) => ({
      sessionId: session.sessionId,
      userId: session.userId,
      accessToken: session.accessToken,
      csrfToken: session.csrfToken,
      auditKey: session.auditKey,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    })),
  };
  const encrypted = await encryptJson(payload);
  await fs.mkdir(path.dirname(ENCRYPTED_STORE), { recursive: true });
  await fs.writeFile(ENCRYPTED_STORE, encrypted, { encoding: "utf8", mode: 0o600 });
}

async function migrateLegacyStore(): Promise<void> {
  try {
    const raw = await fs.readFile(LEGACY_STORE, "utf8");
    const parsed = JSON.parse(raw) as {
      sessions?: Record<string, { accessToken: string; savedAt?: string }>;
    };
    for (const [userId, row] of Object.entries(parsed.sessions ?? {})) {
      if (!row.accessToken) {
        continue;
      }
      createSession(userId, row.accessToken);
    }
    await fs.rename(LEGACY_STORE, `${LEGACY_STORE}.migrated`);
    await persistSessions();
    console.log("Migrated plaintext kite-session.json to encrypted store.");
  } catch {
    // no legacy file
  }
}

export async function restorePersistedSessions(): Promise<string[]> {
  await migrateLegacyStore();
  pruneExpired();

  try {
    const encrypted = await fs.readFile(ENCRYPTED_STORE, "utf8");
    const parsed = await decryptJson<{
      version: number;
      sessions: Array<Omit<AppSession, "createdAt"> & { createdAt: number }>;
    }>(encrypted);

    for (const row of parsed.sessions ?? []) {
      if (Date.now() > row.expiresAt) {
        continue;
      }
      sessionsById.set(row.sessionId, {
        sessionId: row.sessionId,
        userId: row.userId,
        accessToken: row.accessToken,
        csrfToken: row.csrfToken,
        auditKey: row.auditKey,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      });
    }
  } catch {
    // first run
  }

  return getActiveSessionUserIds();
}

export function createSession(userId: string, accessToken: string): AppSession {
  const now = Date.now();
  const session: AppSession = {
    sessionId: newSessionId(),
    userId,
    accessToken,
    csrfToken: newCsrfToken(),
    auditKey: buildAuditKey(userId),
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE_SEC * 1000,
  };
  sessionsById.set(session.sessionId, session);
  void persistSessions();
  return session;
}

function sessionFromEncryptedCookie(req?: Request): AppSession | undefined {
  if (!req || !useStatelessSessions()) {
    return undefined;
  }
  const raw = req.cookies?.[SESSION_BLOB_COOKIE];
  if (!raw) {
    return undefined;
  }
  try {
    const session = decryptJsonSync<AppSession>(decodeURIComponent(raw));
    if (isExpired(session)) {
      return undefined;
    }
    sessionsById.set(session.sessionId, session);
    return session;
  } catch {
    return undefined;
  }
}

export function getSessionById(
  sessionId: string | undefined,
  req?: Request,
): AppSession | undefined {
  const blobSession = sessionFromEncryptedCookie(req);
  if (blobSession) {
    if (!sessionId || blobSession.sessionId === sessionId) {
      return blobSession;
    }
  }

  if (!sessionId) {
    return undefined;
  }
  const session = sessionsById.get(sessionId);
  if (!session || isExpired(session)) {
    if (session) {
      sessionsById.delete(sessionId);
    }
    return undefined;
  }
  return session;
}

/** @deprecated Prefer resolveRequestSession; pass `req` on serverless for cookie-backed sessions. */
export function getSession(userId: string, req?: Request) {
  for (const session of sessionsById.values()) {
    if (session.userId === userId && !isExpired(session)) {
      return { accessToken: session.accessToken, userId: session.userId };
    }
  }
  const blob = sessionFromEncryptedCookie(req);
  if (blob?.userId === userId) {
    return { accessToken: blob.accessToken, userId: blob.userId };
  }
  return undefined;
}

export function getActiveSessionUserIds(): string[] {
  pruneExpired();
  return [...new Set([...sessionsById.values()].map((session) => session.userId))];
}

export function getAuditStorageKey(userId: string): string {
  for (const session of sessionsById.values()) {
    if (session.userId === userId) {
      return session.auditKey;
    }
  }
  return buildAuditKey(userId);
}

export function resolveRequestSession(
  req: Request,
  res: Response,
): { sessionId: string; userId: string; accessToken: string } | undefined {
  const sessionId = req.cookies?.[SESSION_COOKIE] as string | undefined;
  let session = getSessionById(sessionId, req);

  // One-time migration: old tc_user cookie → issue tc_sid without duplicating sessions
  if (!session) {
    const legacyUserId = req.cookies?.tc_user as string | undefined;
    if (legacyUserId) {
      for (const candidate of sessionsById.values()) {
        if (candidate.userId === legacyUserId && !isExpired(candidate)) {
          session = candidate;
          setAuthCookies(res, session);
          break;
        }
      }
    }
  }

  if (!session) {
    return undefined;
  }

  return {
    sessionId: session.sessionId,
    userId: session.userId,
    accessToken: session.accessToken,
  };
}

export function reconcileStaleSession(req: Request, res: Response): string | undefined {
  return resolveRequestSession(req, res)?.userId;
}

export function getCsrfTokenForRequest(req: Request): string | undefined {
  const sessionId = req.cookies?.[SESSION_COOKIE] as string | undefined;
  return getSessionById(sessionId, req)?.csrfToken;
}

export function validateCsrf(req: Request): boolean {
  const sessionId = req.cookies?.[SESSION_COOKIE] as string | undefined;
  const session = getSessionById(sessionId, req);
  if (!session) {
    return false;
  }
  const header = req.headers["x-csrf-token"];
  const headerToken = Array.isArray(header) ? header[0] : header;
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const token = headerToken ?? cookieToken;
  if (!token || token.length < 16) {
    return false;
  }
  return token === session.csrfToken;
}

export function setAuthCookies(res: Response, session: AppSession): void {
  const maxAge = SESSION_MAX_AGE_SEC;
  const suffix = cookieSuffix();
  const cookies = [
    `${SESSION_COOKIE}=${encodeURIComponent(session.sessionId)}; HttpOnly; Max-Age=${maxAge}${suffix}`,
    `${CSRF_COOKIE}=${encodeURIComponent(session.csrfToken)}; Max-Age=${maxAge}${suffix}`,
    `tc_trading_mode=live; Max-Age=${maxAge}${suffix}`,
    `tc_user=; HttpOnly; Max-Age=0; Path=/${suffix}`,
  ];

  if (useStatelessSessions()) {
    const blob = encryptJsonSync({
      sessionId: session.sessionId,
      userId: session.userId,
      accessToken: session.accessToken,
      csrfToken: session.csrfToken,
      auditKey: session.auditKey,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    });
    cookies.push(
      `${SESSION_BLOB_COOKIE}=${encodeURIComponent(blob)}; HttpOnly; Max-Age=${maxAge}${suffix}`,
    );
  }

  res.setHeader("Set-Cookie", cookies);
}

export function clearAuthCookies(res: Response): void {
  const suffix = cookieSuffix();
  res.setHeader("Set-Cookie", [
    `${SESSION_COOKIE}=; HttpOnly; Max-Age=0; Path=/${suffix}`,
    `${CSRF_COOKIE}=; Max-Age=0; Path=/${suffix}`,
    `${SESSION_BLOB_COOKIE}=; HttpOnly; Max-Age=0; Path=/${suffix}`,
    `tc_user=; HttpOnly; Max-Age=0; Path=/${suffix}`,
    `tc_trading_mode=; Max-Age=0; Path=/${suffix}`,
  ]);
}

export async function destroySessionById(sessionId: string | undefined): Promise<void> {
  if (!sessionId) {
    return;
  }
  sessionsById.delete(sessionId);
  await persistSessions();
}

export async function destroySessionsForUserId(userId: string): Promise<AppSession | undefined> {
  let removed: AppSession | undefined;
  for (const [id, session] of sessionsById) {
    if (session.userId === userId) {
      removed = session;
      sessionsById.delete(id);
    }
  }
  await persistSessions();
  return removed;
}

export function createOAuthState(): string {
  const state = randomBytes(24).toString("hex");
  oauthStates.set(state, Date.now());
  return state;
}

export function setOAuthStateCookie(res: Response, state: string): void {
  const suffix = cookieSuffix();
  const cookie = `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; Max-Age=${OAUTH_STATE_MAX_AGE_SEC}${suffix}`;
  const existing = res.getHeader("Set-Cookie");
  if (existing) {
    const list = Array.isArray(existing) ? existing.map(String) : [String(existing)];
    res.setHeader("Set-Cookie", [...list, cookie]);
  } else {
    res.setHeader("Set-Cookie", cookie);
  }
}

function clearOAuthStateCookie(res: Response): void {
  const suffix = cookieSuffix();
  res.appendHeader(
    "Set-Cookie",
    `${OAUTH_STATE_COOKIE}=; HttpOnly; Max-Age=0; Path=/${suffix}`,
  );
}

/** Validates login CSRF token (Kite does not echo `state` — cookie-only fallback). */
export function consumeOAuthState(
  state: string | undefined,
  req?: Request,
  res?: Response,
): boolean {
  const cookieState = req?.cookies?.[OAUTH_STATE_COOKIE];
  let valid = false;

  if (state) {
    const created = oauthStates.get(state);
    if (created != null && Date.now() - created <= OAUTH_STATE_TTL_MS) {
      valid = true;
      oauthStates.delete(state);
    }
    if (!valid && typeof cookieState === "string" && cookieState === state) {
      valid = true;
    }
  } else if (typeof cookieState === "string" && /^[a-f0-9]{32,}$/i.test(cookieState)) {
    // Zerodha callback: ?request_token=…&status=success (no state param)
    const created = oauthStates.get(cookieState);
    if (created != null && Date.now() - created <= OAUTH_STATE_TTL_MS) {
      valid = true;
      oauthStates.delete(cookieState);
    } else {
      // Server restarted or cookie survived in-memory loss (tunnel) — hex shape is enough
      valid = true;
    }
  }

  if (res) {
    clearOAuthStateCookie(res);
  }

  return valid;
}

export function appendOAuthStateToLoginUrl(loginUrl: string, state: string): string {
  const separator = loginUrl.includes("?") ? "&" : "?";
  return `${loginUrl}${separator}state=${encodeURIComponent(state)}`;
}
