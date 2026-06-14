/** Debug / audit API routes (expose raw Kite payloads). Off in production unless opted in. */
export function areDebugRoutesEnabled(): boolean {
  if (process.env.KITE_DEBUG_ROUTES === "0") {
    return false;
  }
  if (process.env.NODE_ENV === "production") {
    return process.env.KITE_DEBUG_ROUTES === "1";
  }
  return process.env.KITE_DEBUG_ROUTES !== "0";
}

export function useSecureCookies(): boolean {
  return process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
}

export const SESSION_COOKIE = "tc_sid";
export const CSRF_COOKIE = "tc_csrf";
export const OAUTH_STATE_COOKIE = "tc_oauth_state";
export const SESSION_MAX_AGE_SEC = 8 * 60 * 60;
export const OAUTH_STATE_MAX_AGE_SEC = 10 * 60;
