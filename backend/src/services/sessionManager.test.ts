import type { Request, Response } from "express";
import {
  consumeOAuthState,
  createOAuthState,
  setOAuthStateCookie,
} from "./sessionManager.js";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function mockRes(): Response {
  const headers: Record<string, string | string[]> = {};
  return {
    appendHeader(name: string, value: string) {
      const prev = headers[name];
      headers[name] = prev ? [...(Array.isArray(prev) ? prev : [prev]), value] : value;
      return this;
    },
    setHeader(name: string, value: string | string[]) {
      headers[name] = value;
      return this;
    },
    getHeader(name: string) {
      const value = headers[name];
      return value;
    },
  } as unknown as Response;
}

// Kite callback has no `state` query param — cookie from /auth/kite/login must suffice.
{
  const res = mockRes();
  const state = createOAuthState();
  setOAuthStateCookie(res, state);
  const setCookieRaw = res.getHeader("Set-Cookie");
  const setCookie = setCookieRaw
    ? Array.isArray(setCookieRaw)
      ? setCookieRaw.map(String)
      : [String(setCookieRaw)]
    : [];
  const cookieLine = setCookie.find((line) => line.startsWith("tc_oauth_state="));
  assert(Boolean(cookieLine), "Expected oauth state cookie to be set");
  const cookieValue = cookieLine!.split("=")[1].split(";")[0];

  const req = { cookies: { tc_oauth_state: cookieValue } } as unknown as Request;
  assert(
    consumeOAuthState(undefined, req, mockRes()),
    "Should accept login when Kite omits state but cookie is present",
  );
}

assert(
  !consumeOAuthState(undefined, { cookies: {} } as unknown as Request, mockRes()),
  "Should reject callback with no state and no cookie",
);

console.log("sessionManager.test.ts: all assertions passed");
