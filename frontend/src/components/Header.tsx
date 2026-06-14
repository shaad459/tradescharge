import type { ReactNode } from "react";
import type { Theme } from "../hooks/useTheme";
import type { ExecutionAlert } from "../types";
import { NotificationBell } from "./NotificationBell";
import { formatCurrency, formatPercentChange, pnlClass } from "../utils/format";
import { VIEW_ONLY } from "../config/viewOnly";

interface HeaderProps {
  balance: number;
  availableMargin: number;
  dayChangePct?: number;
  mode: "demo" | "live";
  theme: Theme;
  onToggleTheme: () => void;
  onOpenMenu: () => void;
  clock?: ReactNode;
  notifications?: ExecutionAlert[];
  onNotificationSelect?: (alert: ExecutionAlert) => void;
  onDismissNotifications?: () => void;
}

export function Header({
  balance,
  availableMargin,
  dayChangePct,
  mode,
  theme,
  onToggleTheme,
  onOpenMenu,
  clock,
  notifications = [],
  onNotificationSelect,
  onDismissNotifications,
}: HeaderProps) {
  const isDark = theme === "dark";

  return (
    <header className="header">
      <div className="header-left">
        <button
          type="button"
          className="icon-btn menu-btn"
          onClick={onOpenMenu}
          aria-label="Open account menu"
        >
          <span className="hamburger" aria-hidden="true" />
        </button>
        <div className="brand">
          <h1>
            Tradescharge
            {VIEW_ONLY && <span className="brand-view-only">View-only</span>}
          </h1>
          <p>{VIEW_ONLY ? "Net P&L after Zerodha costs — trade on Kite" : "Real-time P&L after Zerodha costs"}</p>
        </div>
      </div>

      <div className="header-right">
        {onNotificationSelect && onDismissNotifications && (
          <NotificationBell
            notifications={notifications}
            onSelect={onNotificationSelect}
            onDismissAll={onDismissNotifications}
          />
        )}
        <button
          type="button"
          className="theme-switch"
          role="switch"
          aria-checked={isDark}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={onToggleTheme}
        >
          <span className="theme-switch-label">Light</span>
          <span className={`theme-switch-track ${isDark ? "dark" : "light"}`}>
            <span className="theme-switch-thumb" />
          </span>
          <span className="theme-switch-label">Dark</span>
        </button>
        {clock}
        <div className="balance-card">
          <div className="balance-label">Capital Balance</div>
          <div className="balance-value-row">
            <div className="balance-value">{formatCurrency(balance)}</div>
            {dayChangePct != null && (
              <span className={`balance-day-change ${pnlClass(dayChangePct)}`}>
                {formatPercentChange(dayChangePct)}
              </span>
            )}
          </div>
          <div className="balance-sub">
            Today&apos;s net P&amp;L included · Available: {formatCurrency(availableMargin)}
            {dayChangePct != null && (
              <span className="balance-day-label"> · vs opening balance</span>
            )}
            <span className={`badge ${mode}`}>{mode}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
