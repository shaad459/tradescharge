import { useEffect, useState } from "react";
import { getKiteLoginUrl } from "../api/client";
import type { AuthStatus } from "../types";
import type { Theme } from "../hooks/useTheme";
import { setTradingMode } from "../utils/tradingMode";
import { trackEvent } from "../utils/analytics";
import { VIEW_ONLY } from "../config/viewOnly";
import "../landing.css";

interface LandingPageProps {
  authStatus: AuthStatus | null;
  authMessage: string | null;
  theme: Theme;
  onToggleTheme: () => void;
  onEnterDemo: () => void;
}

export function LandingPage({
  authStatus,
  authMessage,
  theme,
  onToggleTheme,
  onEnterDemo,
}: LandingPageProps) {
  const [safetyOpen, setSafetyOpen] = useState(false);
  const kiteReady = authStatus?.kiteConfigured ?? false;

  useEffect(() => {
    trackEvent("landing_view");
  }, []);

  function handleKiteLogin() {
    if (!kiteReady) {
      return;
    }
    trackEvent("kite_login_started");
    setTradingMode("live");
    window.location.href = getKiteLoginUrl();
  }

  return (
    <div className="landing-page">
      <header className="landing-topbar">
        <div className="landing-logo">
          <span className="landing-logo-icon">₹</span>
          <span>Tradescharge</span>
        </div>
        <button
          type="button"
          className="theme-switch landing-theme-switch"
          role="switch"
          aria-checked={theme === "dark"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={onToggleTheme}
        >
          <span className="theme-switch-label">Light</span>
          <span className={`theme-switch-track ${theme === "dark" ? "dark" : "light"}`}>
            <span className="theme-switch-thumb" />
          </span>
          <span className="theme-switch-label">Dark</span>
        </button>
      </header>

      <div className="landing-body">
        <section className="landing-hero">
          <p className="landing-eyebrow">{VIEW_ONLY ? "View-only dashboard" : "Welcome to"}</p>
          <h1>
            Real-time options P&amp;L
            <br />
            <span>after Zerodha costs</span>
          </h1>
          <p className="landing-lead">
            {VIEW_ONLY
              ? "See gross and net P&L on every open position — brokerage, STT, exchange fees, GST, and stamp duty. Place and manage orders on Kite."
              : "See gross and net P&L on every open position, with brokerage, STT, exchange fees, GST, and stamp duty — calculated the way your contract note does."}
          </p>

          <ul className="landing-features">
            <li>Live net P&amp;L on F&amp;O positions</li>
            <li>Charge-aware breakeven calculator (portfolio &amp; partial exits)</li>
            <li>Live index prices for Nifty, Bank Nifty, and Sensex</li>
            {VIEW_ONLY && <li>Read-only — no orders placed from Tradescharge</li>}
          </ul>

          <div className="landing-note">
            <strong>No extra platform fees</strong>
            <p>You only pay your normal brokerage. Tradescharge reads your account via Kite Connect.</p>
          </div>
        </section>

        <section className="landing-card">
          <h2>Login with your broker</h2>
          <p className="landing-card-sub">
            {VIEW_ONLY
              ? "Connect with Kite to sync balance and positions — view only."
              : "Connect with Kite to sync balance, positions, and place orders."}
          </p>

          {authMessage && <div className="landing-alert">{authMessage}</div>}

          {!kiteReady && (
            <div className="landing-alert landing-alert-warn">
              Kite Connect is not configured on this server. Check your API keys in <code>.env</code> and
              restart the app.
            </div>
          )}

          <button
            type="button"
            className="landing-kite-login-btn"
            onClick={handleKiteLogin}
            disabled={!kiteReady}
          >
            <img src="/kite-logo.png" alt="" className="landing-kite-logo" width={40} height={40} />
            <span>
              Login with Kite
              <small>Secure OAuth via Kite Connect</small>
            </span>
          </button>

          <p className="landing-open-account">
            Don&apos;t have a Kite account?{" "}
            <a href="https://zerodha.com/open-account" target="_blank" rel="noreferrer">
              Open Now
            </a>
          </p>

          <div className="landing-divider">
            <span>Or continue with</span>
          </div>

          <button type="button" className="landing-demo-btn" onClick={onEnterDemo}>
            Try demo mode
          </button>
          <p className="landing-demo-hint">
            {VIEW_ONLY
              ? "Sample positions with simulated LTPs — connect Kite for live data"
              : "Paper positions — connect Kite anytime for live market data"}
          </p>

          <button
            type="button"
            className="landing-safety-toggle"
            onClick={() => setSafetyOpen((open) => !open)}
            aria-expanded={safetyOpen}
          >
            Is it safe to login with Kite?
            <span>{safetyOpen ? "▾" : "▸"}</span>
          </button>

          {safetyOpen && (
            <div className="landing-safety-copy">
              Login uses Kite Connect OAuth. Your password is entered only on Kite&apos;s site —
              Tradescharge never sees it. We receive a session token to read positions and margins,
              scoped to what you approve. {VIEW_ONLY && "Tradescharge does not place orders."}
            </div>
          )}

          <p className="landing-terms">
            By proceeding, you agree to use Tradescharge for personal trading analysis. Calculators
            are illustrative only — not investment advice. Tradescharge is not a SEBI-registered
            investment adviser or research analyst.
          </p>
        </section>
      </div>

      <footer className="landing-footer">Tradescharge · Built for Kite F&amp;O traders</footer>
    </div>
  );
}
