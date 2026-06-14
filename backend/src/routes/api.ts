import { Router } from "express";
import {
  calculateBreakeven,
  calculateAddToPositionPortfolioExit,
  calculateOpenPositionPortfolioExit,
  calculatePartialExitRemainingPortfolioExit,
  calculatePortfolioRecoveryBreakeven,
} from "../services/charges.js";
import { buildDashboard } from "../services/dashboard.js";
import { fetchLiveKiteSnapshot } from "../services/liveKiteSync.js";
import { kiteAuditStatus, readLatestKiteAudit } from "../services/kiteAuditLog.js";
import {
  finalizeDailyLedger,
  ledgerStatus,
  listLedgerDays,
  readContractNote,
  readDailyLedger,
  readLedgerReconcile,
  saveContractNote,
  type ContractNoteEntry,
} from "../services/dailyLedger.js";
import { captureKiteAuditForUser } from "../services/kiteAuditCapture.js";
import { handleCancelOrder, handlePlaceOrder } from "../services/orders.js";
import {
  fetchLiveMargins,
  fetchLivePositions,
  fetchLiveProfile,
  fetchLiveTrades,
  getSession,
  isKiteConfigured,
  reconcileStaleSession,
  refreshMockPositionsFromKite,
} from "../services/kite.js";
import { mockAccount, mockTransactions } from "../mock/account.js";
import { MOCK_BALANCE, getMockPositions, getClosedPositions } from "../mock/positionStore.js";
import { subscribeLtpStreamClient } from "../services/ltpStream.js";
import { primeLiveStreamCache } from "../services/liveStream.js";
import { fetchKiteBookSummary } from "../services/liveClosedPositions.js";
import { ensureMarketWatch } from "../services/kiteMarketWatch.js";
import { resolveTradingMode } from "../utils/tradingMode.js";
import { isViewOnly } from "../config/viewOnly.js";
import { blockOrdersInViewOnly } from "../middleware/viewOnlyOrders.js";
import { requireCsrf } from "../middleware/csrf.js";
import { requireDebugRoutes } from "../middleware/debugRoutes.js";

export const apiRouter = Router();

apiRouter.use(requireCsrf);

apiRouter.get("/config", (_req, res) => {
  res.json({ viewOnly: isViewOnly() });
});

apiRouter.post("/orders", blockOrdersInViewOnly, handlePlaceOrder);
apiRouter.post("/orders/:id/cancel", blockOrdersInViewOnly, handleCancelOrder);

apiRouter.get("/dashboard", async (req, res) => {
  const userId = reconcileStaleSession(req, res);
  const session = userId ? getSession(userId) : undefined;
  const hasSession = Boolean(session?.accessToken && isKiteConfigured());
  const tradingMode = resolveTradingMode(req);

  try {
    if (hasSession && session && userId && tradingMode === "live") {
      const snapshot = await fetchLiveKiteSnapshot(session.accessToken, {
        userId,
        source: "dashboard",
      });

      if (userId) {
        primeLiveStreamCache(userId, snapshot);
        const positionTokens = snapshot.positions
          .map((position) => position.instrumentToken)
          .filter((token): token is number => token != null && token > 0);
        void ensureMarketWatch(userId, session.accessToken, positionTokens).catch(console.error);
      }

      return res.json(
        buildDashboard(
          snapshot.positions,
          snapshot.margins.net,
          snapshot.margins.available,
          "live",
          true,
          snapshot.closedPositions,
          true,
          {
            openOrders: snapshot.openOrders,
            orderHistory: snapshot.orderHistory,
            executedTransactions: snapshot.executedTransactions,
          },
          {
            openingBalance: snapshot.margins.openingBalance,
            m2mRealised: snapshot.margins.m2mRealised,
            m2mUnrealised: snapshot.margins.m2mUnrealised,
            marginEnabled: snapshot.margins.marginEnabled,
          },
          snapshot.trades,
        ),
      );
    }

    if (hasSession && session && tradingMode === "demo") {
      const [margins, positions] = await Promise.all([
        fetchLiveMargins(session.accessToken),
        refreshMockPositionsFromKite(session.accessToken),
      ]);

      return res.json(
        buildDashboard(
          positions,
          margins.net,
          margins.available,
          "demo",
          true,
          getClosedPositions(),
          true,
          undefined,
          {
            openingBalance: margins.openingBalance,
            m2mRealised: margins.m2mRealised,
            m2mUnrealised: margins.m2mUnrealised,
            marginEnabled: margins.marginEnabled,
          },
        ),
      );
    }

    const positions = getMockPositions();
    res.json(
      buildDashboard(
        positions,
        MOCK_BALANCE,
        MOCK_BALANCE * 0.82,
        "demo",
        false,
        getClosedPositions(),
        false,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard";
    res.status(500).json({ error: message });
  }
});

apiRouter.get("/ltp/stream", (req, res) => {
  const userId = reconcileStaleSession(req, res);
  const tradingMode = resolveTradingMode(req);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  subscribeLtpStreamClient(res, userId, tradingMode);
});

/** Local Kite audit log status (raw API payloads for contract-note reconciliation). */
apiRouter.get("/debug/kite-audit", requireDebugRoutes, async (req, res) => {
  const userId = reconcileStaleSession(req, res);
  if (!userId) {
    return res.status(401).json({ error: "Login required" });
  }
  try {
    return res.json(await kiteAuditStatus(userId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read audit log";
    res.status(500).json({ error: message });
  }
});

apiRouter.get("/debug/kite-audit/latest", requireDebugRoutes, async (req, res) => {
  const userId = reconcileStaleSession(req, res);
  if (!userId) {
    return res.status(401).json({ error: "Login required" });
  }
  const latest = await readLatestKiteAudit(userId);
  if (!latest) {
    return res.status(404).json({ error: "No audit snapshot for today yet" });
  }
  return res.json(latest);
});

/** Force-write a full Kite snapshot to disk (use before comparing contract note). */
apiRouter.post("/debug/kite-audit/capture", requireDebugRoutes, async (req, res) => {
  const userId = reconcileStaleSession(req, res);
  const session = userId ? getSession(userId) : undefined;
  if (!userId || !session?.accessToken || !isKiteConfigured()) {
    return res.status(401).json({ error: "Kite login required" });
  }
  try {
    const snapshot = await fetchLiveKiteSnapshot(session.accessToken, {
      userId,
      source: "manual-capture",
      force: true,
    });
    const status = await kiteAuditStatus(userId);
    return res.json({
      ok: true,
      capturedAt: status.latestCapturedAt,
      path: status.root,
      closedCount: snapshot.closedPositions.length,
      executedCount: snapshot.executedTransactions.length,
      tradeCount: snapshot.trades.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Capture failed";
    res.status(500).json({ error: message });
  }
});

/** Daily trading ledger — one folder per IST day for contract-note audit. */
apiRouter.get("/ledger", async (req, res) => {
  const userId = reconcileStaleSession(req, res);
  if (!userId) {
    return res.status(401).json({ error: "Login required" });
  }
  try {
    const days = await listLedgerDays(userId);
    const status = await ledgerStatus(userId);
    return res.json({ ...status, days });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read ledger";
    return res.status(500).json({ error: message });
  }
});

apiRouter.get("/ledger/:tradeDate", async (req, res) => {
  const userId = reconcileStaleSession(req, res);
  if (!userId) {
    return res.status(401).json({ error: "Login required" });
  }
  const tradeDate = String(req.params.tradeDate);
  const ledger = await readDailyLedger(userId, tradeDate);
  if (!ledger) {
    return res.status(404).json({ error: `No ledger for ${tradeDate}` });
  }
  const contractNote = await readContractNote(userId, tradeDate);
  const reconcile = await readLedgerReconcile(userId, tradeDate);
  return res.json({ ...ledger, contractNote, reconcile });
});

apiRouter.put("/ledger/:tradeDate/contract-note", async (req, res) => {
  const userId = reconcileStaleSession(req, res);
  if (!userId) {
    return res.status(401).json({ error: "Login required" });
  }
  const tradeDate = String(req.params.tradeDate);
  const body = req.body as Partial<ContractNoteEntry>;
  const entry = await saveContractNote(userId, tradeDate, {
    payInOutObligation: body.payInOutObligation,
    brokerage: body.brokerage,
    exchange: body.exchange,
    gst: body.gst,
    stt: body.stt,
    sebi: body.sebi,
    stamp: body.stamp,
    netPayable: body.netPayable,
    notes: body.notes,
  });
  const reconcile = await readLedgerReconcile(userId, tradeDate);
  return res.json({ contractNote: entry, reconcile });
});

apiRouter.post("/ledger/:tradeDate/capture", async (req, res) => {
  const userId = reconcileStaleSession(req, res);
  const session = userId ? getSession(userId) : undefined;
  if (!userId || !session?.accessToken || !isKiteConfigured()) {
    return res.status(401).json({ error: "Kite login required" });
  }
  const tradeDate = String(req.params.tradeDate);
  const result = await captureKiteAuditForUser(userId, "ledger-manual-capture");
  if (!result.ok) {
    return res.status(500).json({ error: result.error ?? "Capture failed" });
  }
  const ledger = await readDailyLedger(userId, tradeDate);
  return res.json({ ok: true, ledger: ledger?.summary ?? null });
});

apiRouter.post("/ledger/:tradeDate/finalize", async (req, res) => {
  const userId = reconcileStaleSession(req, res);
  if (!userId) {
    return res.status(401).json({ error: "Login required" });
  }
  const tradeDate = String(req.params.tradeDate);
  const summary = await finalizeDailyLedger(userId, tradeDate);
  if (!summary) {
    return res.status(404).json({ error: `No ledger for ${tradeDate}` });
  }
  return res.json({ ok: true, summary });
});

/** Compare Kite sell fills vs consolidated closed legs (logged-in live only). */
apiRouter.get("/debug/kite-book", requireDebugRoutes, async (req, res) => {
  const userId = reconcileStaleSession(req, res);
  const session = userId ? getSession(userId) : undefined;

  if (!session?.accessToken || !isKiteConfigured()) {
    return res.status(401).json({ error: "Kite login required" });
  }

  try {
    const summary = await fetchKiteBookSummary(session.accessToken);
    res.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Kite book";
    res.status(500).json({ error: message });
  }
});

apiRouter.get("/breakeven", async (req, res) => {
  const lotSize = Number(req.query.lotSize ?? 65);
  const lots = Number(req.query.lots ?? 1);
  const ltp = Number(req.query.ltp);
  const heldLots = req.query.heldLots !== undefined ? Number(req.query.heldLots) : undefined;
  const existingBuyPrice =
    req.query.existingBuyPrice !== undefined ? Number(req.query.existingBuyPrice) : undefined;
  const portfolioNetPnL =
    req.query.portfolioNetPnL !== undefined
      ? Number(req.query.portfolioNetPnL)
      : req.query.priorClosedNetPnL !== undefined
        ? Number(req.query.priorClosedNetPnL)
        : undefined;
  const startingCapital =
    req.query.startingCapital !== undefined ? Number(req.query.startingCapital) : undefined;
  const side = req.query.side === "short" ? "short" : "long";

  if (!ltp || ltp <= 0) {
    return res.status(400).json({ error: "ltp is required" });
  }

  if (!lots || lots <= 0) {
    return res.status(400).json({ error: "lots must be positive" });
  }

  if (portfolioNetPnL !== undefined && Number.isFinite(portfolioNetPnL)) {
    if (
      existingBuyPrice !== undefined &&
      heldLots !== undefined &&
      Number.isFinite(existingBuyPrice) &&
      Number.isFinite(heldLots)
    ) {
      if (lots < heldLots) {
        return res.json(
          calculatePartialExitRemainingPortfolioExit(
            existingBuyPrice,
            lotSize,
            heldLots,
            lots,
            ltp,
            portfolioNetPnL,
          ),
        );
      }

      if (lots === heldLots) {
        return res.json(
          calculateOpenPositionPortfolioExit(
            existingBuyPrice,
            lotSize,
            lots,
            ltp,
            portfolioNetPnL,
            side,
          ),
        );
      }

      if (lots > heldLots) {
        return res.json(
          calculateAddToPositionPortfolioExit(
            existingBuyPrice,
            lotSize,
            lots,
            heldLots,
            ltp,
            portfolioNetPnL,
          ),
        );
      }
    }

    return res.json(
      calculatePortfolioRecoveryBreakeven(
        ltp,
        lotSize,
        lots,
        portfolioNetPnL,
        Number.isFinite(startingCapital) ? startingCapital : undefined,
      ),
    );
  }

  res.json(calculateBreakeven(ltp, lotSize, lots, heldLots, existingBuyPrice, side));
});

apiRouter.get("/account", async (req, res) => {
  const userId = reconcileStaleSession(req, res);
  const session = userId ? getSession(userId) : undefined;
  const hasSession = Boolean(session?.accessToken && isKiteConfigured());
    const tradingMode = resolveTradingMode(req);

  try {
    let balance = MOCK_BALANCE;
    let availableMargin = MOCK_BALANCE * 0.82;
    let mode: "demo" | "live" = "demo";

    if (hasSession && session && tradingMode === "live") {
      const [margins, profile, trades] = await Promise.all([
        fetchLiveMargins(session.accessToken),
        fetchLiveProfile(session.accessToken),
        fetchLiveTrades(session.accessToken),
      ]);
      balance = margins.net;
      availableMargin = margins.available;
      mode = "live";

      const utilisedMargin = Math.max(0, balance - availableMargin);

      return res.json({
        account: profile,
        transactions: trades,
        balance,
        availableMargin,
        utilisedMargin,
        mode,
      });
    }

    if (hasSession && session && tradingMode === "demo") {
      const [margins, profile] = await Promise.all([
        fetchLiveMargins(session.accessToken),
        fetchLiveProfile(session.accessToken),
      ]);
      balance = margins.net;
      availableMargin = margins.available;
      mode = "demo";

      const positions = await refreshMockPositionsFromKite(session.accessToken);
      const dashboard = buildDashboard(
        positions,
        margins.net,
        margins.available,
        "demo",
        true,
        getClosedPositions(),
        true,
      );
      balance = dashboard.balance;
      availableMargin = dashboard.availableMargin;

      const utilisedMargin = Math.max(0, margins.net - margins.available);

      return res.json({
        account: profile,
        transactions: mockTransactions,
        balance,
        availableMargin,
        utilisedMargin,
        mode,
      });
    }

    const positions = getMockPositions();
    const dashboard = buildDashboard(
      positions,
      MOCK_BALANCE,
      MOCK_BALANCE * 0.82,
      "demo",
      false,
      getClosedPositions(),
      false,
    );
    balance = dashboard.balance;
    availableMargin = dashboard.availableMargin;

    const utilisedMargin = Math.max(0, balance - availableMargin);

    res.json({
      account: mockAccount,
      transactions: mockTransactions,
      balance,
      availableMargin,
      utilisedMargin,
      mode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load account";
    res.status(500).json({ error: message });
  }
});
