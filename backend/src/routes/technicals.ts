import { Router } from "express";
import type { IndexSymbol } from "../constants.js";
import { INDEX_SYMBOLS } from "../constants.js";
import type { TechnicalTimeframeId } from "../services/technicalsService.js";
import {
  fetchTechnicals,
  fetchTechnicalsChart,
  fetchTechnicalsTimeframe,
  findTechnicalTimeframe,
  resolvePreviousDaySession,
  resolveTechnicalsTarget,
  searchKiteInstruments,
  searchStrikeInstruments,
  TECHNICAL_TIMEFRAME_ORDER,
} from "../services/technicalsService.js";
import { TECHNICAL_WATCH_KEYS } from "../constants/technicalsWatchlist.js";
import { listCrudeOilFutures } from "../services/crudeFuturesList.js";
import { fetchMarketContext } from "../services/marketContextService.js";
import { subscribeTechnicalsStream } from "../services/technicalsLive.js";
import { getSession, isKiteConfigured, reconcileStaleSession } from "../services/kite.js";

export const technicalsRouter = Router();

technicalsRouter.get("/", async (req, res) => {
  req.setTimeout(120_000);
  try {
    const userId = reconcileStaleSession(req, res);
    const session = userId ? getSession(userId, req) : undefined;

    if (!session?.accessToken || !isKiteConfigured()) {
      return res.status(401).json({ error: "Kite login required for technical indicators." });
    }

    const target = await resolveTechnicalsTarget({
      index: req.query.index as string | undefined,
      exchange: req.query.exchange as string | undefined,
      tradingsymbol: req.query.tradingsymbol as string | undefined,
      instrumentToken: req.query.instrumentToken as string | undefined,
    });

    if (!target) {
      return res.status(404).json({
        error: `Instrument not found. Use index=${TECHNICAL_WATCH_KEYS.join("|")} or exchange+tradingsymbol.`,
      });
    }

    const data = await fetchTechnicals(session.accessToken, target);
    return res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load technicals";
    return res.status(500).json({ error: message });
  }
});

technicalsRouter.get("/chart", async (req, res) => {
  req.setTimeout(60_000);
  try {
    const userId = reconcileStaleSession(req, res);
    const session = userId ? getSession(userId, req) : undefined;

    if (!session?.accessToken || !isKiteConfigured()) {
      return res.status(401).json({ error: "Kite login required for price chart." });
    }

    const tf = (req.query.tf as string | undefined) ?? "15m";
    if (!findTechnicalTimeframe(tf)) {
      return res.status(400).json({
        error: `Invalid tf. Use one of: ${TECHNICAL_TIMEFRAME_ORDER.join(", ")}`,
      });
    }

    const target = await resolveTechnicalsTarget({
      index: req.query.index as string | undefined,
      exchange: req.query.exchange as string | undefined,
      tradingsymbol: req.query.tradingsymbol as string | undefined,
      instrumentToken: req.query.instrumentToken as string | undefined,
    });

    if (!target) {
      return res.status(404).json({
        error: `Instrument not found. Use index=${TECHNICAL_WATCH_KEYS.join("|")} or exchange+tradingsymbol.`,
      });
    }

    const data = await fetchTechnicalsChart(
      session.accessToken,
      target,
      tf as TechnicalTimeframeId,
    );
    return res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load chart";
    return res.status(500).json({ error: message });
  }
});

technicalsRouter.get("/timeframe", async (req, res) => {
  req.setTimeout(60_000);
  try {
    const userId = reconcileStaleSession(req, res);
    const session = userId ? getSession(userId, req) : undefined;

    if (!session?.accessToken || !isKiteConfigured()) {
      return res.status(401).json({ error: "Kite login required for technical indicators." });
    }

    const tf = req.query.tf as string | undefined;
    if (!tf || !findTechnicalTimeframe(tf)) {
      return res.status(400).json({
        error: `Invalid tf. Use one of: ${TECHNICAL_TIMEFRAME_ORDER.join(", ")}`,
      });
    }

    const target = await resolveTechnicalsTarget({
      index: req.query.index as string | undefined,
      exchange: req.query.exchange as string | undefined,
      tradingsymbol: req.query.tradingsymbol as string | undefined,
      instrumentToken: req.query.instrumentToken as string | undefined,
    });

    if (!target) {
      return res.status(404).json({
        error: `Instrument not found. Use index=${TECHNICAL_WATCH_KEYS.join("|")} or exchange+tradingsymbol.`,
      });
    }

    const { close: previousDayClose, high: previousDayHigh, low: previousDayLow } =
      await resolvePreviousDaySession(session.accessToken, target.instrumentToken);
    const row = await fetchTechnicalsTimeframe(
      session.accessToken,
      target,
      tf as TechnicalTimeframeId,
      previousDayClose,
    );

    return res.json({
      kind: target.kind,
      indexSymbol: target.indexSymbol,
      watchKey: target.watchKey,
      label: target.label,
      exchange: target.exchange,
      tradingsymbol: target.tradingsymbol,
      instrumentToken: target.instrumentToken,
      previousDayClose,
      previousDayHigh,
      previousDayLow,
      sessionVwap: row.sessionVwap,
      timeframe: row,
      asOf: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load timeframe";
    return res.status(500).json({ error: message });
  }
});

technicalsRouter.get("/stream", async (req, res) => {
  req.setTimeout(300_000);
  try {
    const userId = reconcileStaleSession(req, res);
    const session = userId ? getSession(userId, req) : undefined;

    if (!session?.accessToken || !isKiteConfigured()) {
      return res.status(401).json({ error: "Kite login required for live technical indicators." });
    }

    const target = await resolveTechnicalsTarget({
      index: req.query.index as string | undefined,
      exchange: req.query.exchange as string | undefined,
      tradingsymbol: req.query.tradingsymbol as string | undefined,
      instrumentToken: req.query.instrumentToken as string | undefined,
    });

    if (!target) {
      return res.status(404).json({
        error: `Instrument not found. Use index=${TECHNICAL_WATCH_KEYS.join("|")} or exchange+tradingsymbol.`,
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const bootstrapOnly = req.query.bootstrap === "0";
    await subscribeTechnicalsStream(res, userId, session.accessToken, target, {
      bootstrapOnly,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start technicals stream";
    if (!res.headersSent) {
      return res.status(500).json({ error: message });
    }
    res.end();
  }
});

technicalsRouter.get("/market-context", async (req, res) => {
  try {
    const userId = reconcileStaleSession(req, res);
    const session = userId ? getSession(userId) : undefined;
    const crude =
      (req.query.crude as string | undefined) ??
      (req.query.crudeQuote as string | undefined) ??
      null;

    const accessToken =
      session?.accessToken && isKiteConfigured() ? session.accessToken : undefined;

    const data = await fetchMarketContext(accessToken, { crudeQuoteKey: crude });
    return res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load market context";
    return res.status(500).json({ error: message });
  }
});

technicalsRouter.get("/crude-futures", async (_req, res) => {
  try {
    const futures = await listCrudeOilFutures();
    return res.json({ futures });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list crude futures";
    return res.status(500).json({ error: message });
  }
});

technicalsRouter.get("/instruments", async (req, res) => {
  const q = (req.query.q as string | undefined) ?? "";
  try {
    const results = await searchKiteInstruments(q);
    return res.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instrument search failed";
    return res.status(500).json({ error: message });
  }
});

technicalsRouter.get("/search", async (req, res) => {
  const symbol = (req.query.symbol as string | undefined)?.toUpperCase() as IndexSymbol;
  const q = (req.query.q as string | undefined) ?? "";
  const expiry = req.query.expiry as string | undefined;

  if (!symbol || !INDEX_SYMBOLS.includes(symbol)) {
    return res.status(400).json({ error: "Invalid symbol. Use NIFTY, BANKNIFTY, or SENSEX." });
  }

  try {
    const results = await searchStrikeInstruments(symbol, q, expiry);
    return res.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Strike search failed";
    return res.status(500).json({ error: message });
  }
});
