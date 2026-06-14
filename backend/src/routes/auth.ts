import { Router } from "express";
import {
  appendOAuthStateToLoginUrl,
  clearAuthCookies,
  consumeOAuthState,
  createOAuthState,
  setOAuthStateCookie,
  createSession,
  destroySessionById,
  getCsrfTokenForRequest,
  getLoginUrl,
  getSession,
  isKiteConfigured,
  kiteClient,
  exchangeRequestToken,
  reconcileStaleSession,
  resolveRequestSession,
  setAuthCookies,
} from "../services/kite.js";
import { captureKiteAuditForUser } from "../services/kiteAuditCapture.js";
import { requireCsrf } from "../middleware/csrf.js";
import { SESSION_COOKIE } from "../config/security.js";
import { getKiteRedirectUrl, getPublicAppUrl } from "../config/publicUrl.js";

export const authRouter = Router();

authRouter.get("/kite/login", (_req, res) => {
  if (!process.env.KITE_API_KEY) {
    return res.status(500).json({ error: "KITE_API_KEY is not configured" });
  }

  if (!isKiteConfigured()) {
    return res.status(503).json({
      error: "Kite API secret missing",
      message: "Add KITE_API_SECRET to .env to enable Zerodha login. Demo mode is available.",
    });
  }

  const state = createOAuthState();
  setOAuthStateCookie(res, state);
  res.redirect(appendOAuthStateToLoginUrl(getLoginUrl(), state));
});

authRouter.get("/kite/callback", async (req, res) => {
  const frontendUrl = getPublicAppUrl();
  const requestToken = req.query.request_token as string | undefined;
  const status = req.query.status as string | undefined;
  const state = req.query.state as string | undefined;

  if (status === "cancelled" || !requestToken) {
    return res.redirect(`${frontendUrl}?auth=cancelled`);
  }

  const oauthOk = consumeOAuthState(state, req, res);
  // Kite callback is ?request_token=…&status=success (no state). Cookie may be missing if
  // you used localhost while redirect is 127.0.0.1 — request_token still proves the redirect.
  if (!requestToken) {
    const expectedRedirect = getKiteRedirectUrl();
    return res.redirect(
      `${frontendUrl}?auth=error&message=${encodeURIComponent(
        `No login token from Zerodha. Open the app at ${frontendUrl} (not localhost), then set Kite redirect URL to: ${expectedRedirect}`,
      )}`,
    );
  }
  if (!oauthOk) {
    console.warn(
      "OAuth state cookie missing on callback; continuing with request_token.",
    );
  }

  try {
    const tokens = await exchangeRequestToken(requestToken);
    const session = createSession(tokens.userId, tokens.accessToken);
    setAuthCookies(res, session);
    void captureKiteAuditForUser(session.userId, "login-capture").catch(console.error);
    res.redirect(`${frontendUrl}?auth=success`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed";
    res.redirect(`${frontendUrl}?auth=error&message=${encodeURIComponent(message)}`);
  }
});

authRouter.post("/logout", requireCsrf, async (req, res) => {
  try {
    const resolved = resolveRequestSession(req, res);
    if (resolved) {
      try {
        await kiteClient(resolved.accessToken).invalidateAccessToken();
      } catch (error) {
        console.error("Kite access token invalidation failed:", error);
      }
      await destroySessionById(req.cookies?.[SESSION_COOKIE] as string | undefined);
    }
    clearAuthCookies(res);
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Logout failed";
    res.status(500).json({ error: message });
  }
});

authRouter.get("/status", (req, res) => {
  const userId = reconcileStaleSession(req, res);
  const session = userId ? getSession(userId) : undefined;

  res.json({
    kiteConfigured: isKiteConfigured(),
    hasApiKey: Boolean(process.env.KITE_API_KEY),
    loggedIn: Boolean(session?.accessToken),
    kiteUserId: userId,
    csrfToken: getCsrfTokenForRequest(req),
  });
});
