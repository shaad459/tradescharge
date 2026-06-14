import { getKiteLoginUrl } from "../api/client";
import type { AuthStatus } from "../types";
import { VIEW_ONLY } from "../config/viewOnly";

interface LoginBannerProps {
  authStatus: AuthStatus | null;
  mode: "demo" | "live";
  authenticated?: boolean;
  liveMarketData?: boolean;
  authMessage?: string | null;
}

export function LoginBanner({
  authStatus,
  mode,
  authenticated = false,
  liveMarketData = false,
  authMessage,
}: LoginBannerProps) {
  if (mode === "live") {
    return (
      <div className="banner success">
        <span>
          Connected to Kite. Showing live positions and balance.
          {VIEW_ONLY && " View-only — manage orders on Kite."}
        </span>
      </div>
    );
  }

  if (liveMarketData && authenticated) {
    return (
      <div className="banner success">
        <span>
          Demo trading with live Kite market data — index prices and position LTPs refresh
          every few seconds.
        </span>
      </div>
    );
  }

  if (authMessage) {
    return (
      <div className="banner error">
        <span>{authMessage}</span>
      </div>
    );
  }

  return (
    <div className="banner demo">
      <div>
        <strong>Demo mode</strong>
        <div style={{ marginTop: 4, color: "var(--muted)", fontSize: "0.9rem" }}>
          {VIEW_ONLY
            ? "Sample positions with simulated LTPs. Trade on Kite when logged in."
            : "Paper positions with simulated LTPs. Charges update in real time."}
          {!authStatus?.kiteConfigured && " Add API secret to .env for Kite login."}
        </div>
      </div>
      {authStatus?.kiteConfigured && (
        <a href={getKiteLoginUrl()} className="btn btn-primary">
          Login with Kite
        </a>
      )}
    </div>
  );
}
