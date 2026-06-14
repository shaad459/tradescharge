import { useCallback, useEffect, useState } from "react";

import {

  connectionErrorMessage,

  fetchAccount,

  fetchAuthStatus,

  fetchDashboard,

  logoutKite,

  refreshDashboard,

  resetLtpStream,

  subscribeLtpStream,

} from "./api/client";

import { AccountDrawer } from "./components/AccountDrawer";
import { Header } from "./components/Header";
import { LandingPage } from "./components/LandingPage";
import { useTheme } from "./hooks/useTheme";

import { IstClock } from "./components/IstClock";

import { LoginBanner } from "./components/LoginBanner";

import { IndexTickerStrip } from "./components/IndexTickerStrip";
import { TechnicalsPanel } from "./components/TechnicalsPanel";

import { PnLChart } from "./components/PnLChart";

import { PortfolioSummaryBar } from "./components/PortfolioSummaryBar";
import { PositionsPanel } from "./components/PositionsPanel";

import { ReadOnlyBanner } from "./components/ReadOnlyBanner";
import { OrderPad } from "./components/OrderPad";
import { VIEW_ONLY } from "./config/viewOnly";

import type {

  AccountData,

  AuthStatus,

  DashboardData,

  ExecutionAlert,

  LtpStreamPayload,

  PnLSnapshot,

  PositionsNavigation,

  TradeSelection,
  IndexTicker,
} from "./types";

import { clearTradingMode, setTradingMode } from "./utils/tradingMode";
import { nowIso } from "./utils/datetime";
import { computeAllPositionsTotals, computeStartingCapital } from "./utils/portfolio";
import { getDayChangePct } from "./utils/dayChange";
import { isPlausibleBalanceUpdate } from "./utils/balanceUpdate";
import { initAnalyticsSession, trackEvent, trackFeature } from "./utils/analytics";



const MAX_HISTORY = 90;



const APP_ENTERED_KEY = "tradescharge-app-entered";

function hasEnteredApp(): boolean {
  return localStorage.getItem(APP_ENTERED_KEY) === "true";
}

function markAppEntered() {
  localStorage.setItem(APP_ENTERED_KEY, "true");
}

function getAuthMessageFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const auth = params.get("auth");

  if (auth === "success") return null;
  if (auth === "cancelled") return "Zerodha login was cancelled.";
  if (auth === "error") return params.get("message") ?? "Zerodha login failed.";
  return null;
}

function clearAuthQueryParams() {
  const url = new URL(window.location.href);
  if (url.searchParams.has("auth") || url.searchParams.has("message")) {
    url.searchParams.delete("auth");
    url.searchParams.delete("message");
    window.history.replaceState({}, "", url.pathname + url.search);
  }
}



function snapshotFromDashboard(dashboard: DashboardData): PnLSnapshot {
  const totals = computeAllPositionsTotals(dashboard);
  return {
    timestamp: nowIso(),
    capital: computeStartingCapital(dashboard),
    netPnL: totals.netPnL,
    totalCharges: totals.totalCharges,
  };
}



export default function App() {

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  const [accountData, setAccountData] = useState<AccountData | null>(null);

  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  const [pnlHistory, setPnlHistory] = useState<PnLSnapshot[]>([]);

  const [tradeSelection, setTradeSelection] = useState<TradeSelection | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [appEntered, setAppEntered] = useState(hasEnteredApp);
  const [notifications, setNotifications] = useState<ExecutionAlert[]>([]);
  const [positionsNavigation, setPositionsNavigation] = useState<PositionsNavigation | null>(null);
  const [indexTickers, setIndexTickers] = useState<IndexTicker[]>([]);
  const { theme, toggleTheme } = useTheme();
  const [authMessage] = useState(() => getAuthMessageFromUrl());

  useEffect(() => {
    initAnalyticsSession();
  }, []);

  useEffect(() => {
    if (authMessage) {
      trackEvent("kite_login_failed", { reason: authMessage.slice(0, 80) });
      clearAuthQueryParams();
    }
  }, [authMessage]);

  const appendSnapshot = useCallback((snapshot: PnLSnapshot) => {
    setPnlHistory((prev) => {
      const last = prev[prev.length - 1];
      if (
        last &&
        last.netPnL === snapshot.netPnL &&
        last.totalCharges === snapshot.totalCharges &&
        last.capital === snapshot.capital
      ) {
        return prev;
      }
      const next = [...prev, snapshot];
      return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
    });
  }, []);

  const applyStreamPayload = useCallback((payload: LtpStreamPayload) => {
    if (payload.indexTickers?.length) {
      setIndexTickers(payload.indexTickers);
    }

    if (!payload.positions) {
      return;
    }

    setDashboard((prev) => {
        if (!prev) {
          return prev;
        }

        const nextNetPnL = payload.portfolio?.netPnL ?? prev.portfolio.netPnL;
        const balanceOk = isPlausibleBalanceUpdate(
          prev.balance,
          payload.balance,
          prev.portfolio.netPnL,
          nextNetPnL,
        );

        const next = {
          ...prev,
          balance: balanceOk ? payload.balance : prev.balance,
          availableMargin: payload.availableMargin ?? prev.availableMargin,
          openingBalance: payload.openingBalance ?? prev.openingBalance,
          positions: payload.positions ?? prev.positions,
          closedPositions: payload.closedPositions ?? prev.closedPositions,
          openOrders: payload.openOrders ?? prev.openOrders,
          orderHistory: payload.orderHistory ?? prev.orderHistory,
          executedTransactions: payload.executedTransactions ?? prev.executedTransactions,
          portfolio: payload.portfolio ?? prev.portfolio,
          overnightCarry: payload.overnightCarry ?? prev.overnightCarry,
          mode: payload.mode ?? prev.mode,
          authenticated: payload.liveMarketData ? true : prev.authenticated,
          liveMarketData: payload.liveMarketData ?? prev.liveMarketData,
        };

        setAccountData((accountPrev) =>
          accountPrev
            ? {
                ...accountPrev,
                balance: balanceOk ? payload.balance : accountPrev.balance,
                availableMargin: payload.availableMargin ?? accountPrev.availableMargin,
                mode: payload.mode ?? accountPrev.mode,
              }
            : accountPrev,
        );

        appendSnapshot({
          ...snapshotFromDashboard(next),
          timestamp: payload.timestamp,
        });

      return next;
    });

    if (payload.executionAlerts?.length) {
      setNotifications((prev) => {
        const seen = new Set(prev.map((alert) => alert.id));
        const incoming = payload.executionAlerts!.filter((alert) => !seen.has(alert.id));
        return incoming.length > 0 ? [...incoming, ...prev] : prev;
      });
    }
  }, [appendSnapshot]);

  const loadDashboard = useCallback(async () => {
    const data = await refreshDashboard();
    setDashboard(data);
    appendSnapshot(snapshotFromDashboard(data));
    return data;
  }, [appendSnapshot]);

  const handleLogout = useCallback(async () => {
    setLogoutLoading(true);
    try {
      await logoutKite();
      resetLtpStream();
      clearTradingMode();
      const [data, account, status] = await Promise.all([
        fetchDashboard(),
        fetchAccount(),
        fetchAuthStatus(),
      ]);
      setDashboard(data);
      setAccountData(account);
      setAuthStatus(status);
      setPnlHistory([snapshotFromDashboard(data)]);
      setMenuOpen(false);
      setToast("Logged out of Kite.");
      trackEvent("kite_logout");
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Logout failed");
      setTimeout(() => setToast(null), 5000);
    } finally {
      setLogoutLoading(false);
    }
  }, [appendSnapshot]);

  const loadInitial = useCallback(async () => {
    setConnectionError(null);
    setBootLoading(true);
    try {
      const [data, status, account] = await Promise.all([
        fetchDashboard(),
        fetchAuthStatus(),
        fetchAccount(),
      ]);
      setDashboard(data);
      setAuthStatus(status);
      setAccountData(account);
      appendSnapshot(snapshotFromDashboard(data));
      if (status.loggedIn) {
        setTradingMode("live");
        markAppEntered();
        setAppEntered(true);
      } else {
        clearTradingMode();
        resetLtpStream();
      }
    } catch (err) {
      setConnectionError(connectionErrorMessage(err));
    } finally {
      setBootLoading(false);
    }
  }, [appendSnapshot]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "success") {
      trackEvent("kite_login_success");
      clearAuthQueryParams();
      Promise.all([refreshDashboard(), fetchAccount(), fetchAuthStatus()])
        .then(([data, account, status]) => {
          setDashboard(data);
          setAccountData(account);
          setAuthStatus(status);
          appendSnapshot(snapshotFromDashboard(data));
          setConnectionError(null);
          if (status.loggedIn && data.mode === "live" && data.authenticated) {
            setTradingMode("live");
            markAppEntered();
            setAppEntered(true);
            resetLtpStream();
          } else {
            setError(
              "Kite login did not complete on this site. Open the same share link you started from, add its callback URL in the Kite developer portal, then log in again.",
            );
          }
        })
        .catch((err) => setError(connectionErrorMessage(err)));
    }
  }, [appendSnapshot]);

  useEffect(() => {
    if (dashboard?.mode === "live" && dashboard.authenticated) {
      setTradingMode("live");
      markAppEntered();
      setAppEntered(true);
    }
  }, [dashboard?.mode, dashboard?.authenticated]);

  useEffect(() => {
    if (dashboard?.mode) {
      trackEvent("trading_mode", { mode: dashboard.mode });
    }
  }, [dashboard?.mode]);

  useEffect(() => {
    if (!dashboard) {
      return;
    }

    return subscribeLtpStream(applyStreamPayload);
  }, [dashboard?.mode, dashboard?.authenticated, applyStreamPayload]);

  function handleOrderSuccess(message: string, updatedDashboard?: DashboardData) {

    setToast(message);

    if (updatedDashboard) {

      setDashboard(updatedDashboard);

      appendSnapshot(snapshotFromDashboard(updatedDashboard));

      setAccountData((prev) =>

        prev ? { ...prev, balance: updatedDashboard.balance } : prev,

      );

    } else {

      loadDashboard().catch(console.error);

      fetchAccount().then(setAccountData).catch(console.error);

    }

    setTimeout(() => setToast(null), 5000);

  }

  function handleNotificationSelect(alert: ExecutionAlert) {
    setNotifications((prev) => prev.filter((item) => item.id !== alert.id));
    setPositionsNavigation({
      panel: alert.navigateTo === "closed" ? "closed" : "open",
      highlightId: alert.targetId,
    });
    setToast(alert.message);
    setTimeout(() => setToast(null), 5000);
    trackEvent("execution_alert_opened", { tag: alert.orderTag });
  }

  function handleDismissNotifications() {
    setNotifications([]);
  }



  if (connectionError && !dashboard) {
    return (
      <div className="connection-error">
        <h2>Connection failed</h2>
        <p>{connectionError}</p>
        <p className="connection-error-hint">
          From the Tradescharge folder, run{" "}
          <code>{VIEW_ONLY ? "npm run dev" : "npm run dev:trade"}</code>, then open{" "}
          <a href={VIEW_ONLY ? "http://127.0.0.1:5173" : "http://127.0.0.1:5174"}>
            {VIEW_ONLY ? "http://127.0.0.1:5173" : "http://127.0.0.1:5174"}
          </a>
        </p>
        <button type="button" className="btn btn-primary" onClick={loadInitial} disabled={bootLoading}>
          {bootLoading ? "Connecting…" : "Retry connection"}
        </button>
      </div>
    );
  }

  if (error) {
    return <div className="error-state">{error}</div>;
  }

  const showLanding =
    !appEntered &&
    !authStatus?.loggedIn &&
    !(dashboard?.mode === "live" && dashboard.authenticated);

  if (showLanding) {
    return (
      <LandingPage
        authStatus={authStatus}
        authMessage={authMessage}
        theme={theme}
        onToggleTheme={toggleTheme}
        onEnterDemo={() => {
          setTradingMode("demo");
          markAppEntered();
          setAppEntered(true);
          trackEvent("demo_entered");
          refreshDashboard()
            .then((data) => {
              setDashboard(data);
              appendSnapshot(snapshotFromDashboard(data));
            })
            .catch(console.error);
        }}
      />
    );
  }

  if (!dashboard) {
    return <div className="loading">Loading Tradescharge…</div>;
  }

  const dayChangePct = getDayChangePct(
    dashboard.balance,
    dashboard.mode,
    dashboard.openingBalance,
  );



  return (

    <div className="app-shell">

      <Header
        balance={dashboard.balance}
        availableMargin={dashboard.availableMargin}
        dayChangePct={dayChangePct}
        mode={dashboard.mode}
        theme={theme}
        onToggleTheme={() => {
          toggleTheme();
          trackFeature("theme_toggle");
        }}
        onOpenMenu={() => {
          setMenuOpen(true);
          trackFeature("account_menu");
        }}
        clock={<IstClock />}
        notifications={notifications}
        onNotificationSelect={handleNotificationSelect}
        onDismissNotifications={handleDismissNotifications}
      />

      <PortfolioSummaryBar dashboard={dashboard} />

      {VIEW_ONLY && <ReadOnlyBanner />}

      <LoginBanner

        authStatus={authStatus}

        mode={dashboard.mode}

        authenticated={dashboard.authenticated}

        liveMarketData={dashboard.liveMarketData}

        authMessage={authMessage}

      />



      {toast && <div className="toast">{toast}</div>}



      <div className="app-layout">
        <main className="app-main">

          <IndexTickerStrip streamedIndexTickers={indexTickers} />

          <TechnicalsPanel
            kiteLoggedIn={dashboard.authenticated}
            indexTickers={indexTickers}
          />

          <PositionsPanel
            openPositions={dashboard.positions}
            closedPositions={dashboard.closedPositions ?? []}
            executedTransactions={dashboard.executedTransactions ?? []}
            mode={dashboard.mode}
            navigation={positionsNavigation}
            onNavigationHandled={() => setPositionsNavigation(null)}
            onTrade={VIEW_ONLY ? undefined : setTradeSelection}
          />



          <PnLChart history={pnlHistory} />

        </main>

      </div>



      <AccountDrawer
        kiteUserId={authStatus?.kiteUserId}
        open={menuOpen}
        accountData={accountData}
        kiteLoggedIn={dashboard.authenticated}
        logoutLoading={logoutLoading}
        onClose={() => setMenuOpen(false)}
        onLogout={handleLogout}
      />

      {!VIEW_ONLY && tradeSelection && (
        <OrderPad
          selection={tradeSelection}
          availableMargin={dashboard.availableMargin}
          portfolioNetPnL={computeAllPositionsTotals(dashboard).netPnL}
          startingCapital={computeStartingCapital(dashboard)}
          mode={dashboard.mode}
          onClose={() => setTradeSelection(null)}
          onSuccess={handleOrderSuccess}
        />
      )}

    </div>

  );

}


