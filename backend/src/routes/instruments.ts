import { Router } from "express";
import type { IndexSymbol } from "../constants.js";
import { INDEX_CONFIG, INDEX_SYMBOLS } from "../constants.js";
import { setChainWatch } from "../services/liveStream.js";
import { getStreamMarketData } from "../services/kiteMarketWatch.js";
import { getOptionChain } from "../services/optionChain.js";
import { buildOptionChainFromInstruments } from "../services/kiteInstruments.js";
import { requireCsrf } from "../middleware/csrf.js";
import {
  enrichOptionChainWithLiveQuotes,
  fetchInstrumentLtp,
  fetchLiveIndexTickers,
  getIndexTickers,
  getSession,
  isKiteConfigured,
  reconcileStaleSession,
} from "../services/kite.js";

export const instrumentsRouter = Router();

instrumentsRouter.get("/indices", (_req, res) => {
  res.json({ indices: INDEX_SYMBOLS });
});

instrumentsRouter.get("/index-tickers", async (req, res) => {
  try {
    const userId = reconcileStaleSession(req, res);
    const session = userId ? getSession(userId) : undefined;

    if (session?.accessToken && isKiteConfigured()) {
      if (userId) {
        const streamed = getStreamMarketData(userId);
        if (streamed.indexTickers?.length) {
          return res.json({ tickers: streamed.indexTickers });
        }
      }
      const tickers = await fetchLiveIndexTickers(session.accessToken);
      return res.json({ tickers });
    }

    res.json({ tickers: getIndexTickers() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load index tickers";
    res.status(500).json({ error: message });
  }
});

instrumentsRouter.get("/quote", async (req, res) => {
  const tradingsymbol = (req.query.tradingsymbol as string | undefined)?.trim();
  const exchange = (req.query.exchange as string | undefined)?.trim() ?? "NFO";

  if (!tradingsymbol) {
    return res.status(400).json({ error: "tradingsymbol is required" });
  }

  try {
    const userId = reconcileStaleSession(req, res);
    const session = userId ? getSession(userId) : undefined;

    if (session?.accessToken && isKiteConfigured()) {
      const ltp = await fetchInstrumentLtp(session.accessToken, exchange, tradingsymbol, userId);
      if (ltp != null) {
        return res.json({ tradingsymbol, exchange, ltp, live: true });
      }
    }

    return res.json({ tradingsymbol, exchange, ltp: 0, live: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load quote";
    res.status(500).json({ error: message });
  }
});

instrumentsRouter.post("/chain/watch", requireCsrf, async (req, res) => {
  const symbol = (req.body?.symbol as string | undefined)?.toUpperCase() as IndexSymbol;
  const expiry = req.body?.expiry as string | undefined;

  if (!symbol || !INDEX_SYMBOLS.includes(symbol)) {
    return res.status(400).json({ error: "Invalid symbol. Use NIFTY, BANKNIFTY, or SENSEX." });
  }
  if (!expiry) {
    return res.status(400).json({ error: "expiry is required." });
  }

  try {
    const userId = reconcileStaleSession(req, res);
    const session = userId ? getSession(userId) : undefined;

    if (!session?.accessToken || !isKiteConfigured()) {
      return res.status(401).json({ error: "Kite login required for live chain streaming." });
    }

    const watch = await setChainWatch(userId!, session.accessToken, symbol, expiry);
    if (!watch) {
      return res.status(404).json({ error: "Option chain not found for symbol/expiry." });
    }

    return res.json({ ok: true, chain: watch.chain });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to watch option chain";
    return res.status(500).json({ error: message });
  }
});

instrumentsRouter.get("/chain", async (req, res) => {
  req.setTimeout(120_000);
  const symbol = (req.query.symbol as string)?.toUpperCase() as IndexSymbol;
  const expiry = req.query.expiry as string | undefined;
  const search = req.query.search as string | undefined;
  const fullQuotes = req.query.full === "1" || req.query.full === "true";

  if (!symbol || !INDEX_SYMBOLS.includes(symbol)) {
    return res.status(400).json({ error: "Invalid symbol. Use NIFTY, BANKNIFTY, or SENSEX." });
  }

  try {
    const userId = reconcileStaleSession(req, res);
    const session = userId ? getSession(userId, req) : undefined;
    const hasSession = Boolean(session?.accessToken && isKiteConfigured());

    let spotPrice = INDEX_CONFIG[symbol].spotPrice;
    let spotChange = 0;
    let spotChangePct = 0;
    if (hasSession && session) {
      try {
        const tickers = await fetchLiveIndexTickers(session.accessToken);
        const row = tickers.find((ticker) => ticker.symbol === symbol);
        if (row) {
          spotPrice = row.spotPrice;
          spotChange = row.spotChange;
          spotChangePct = row.spotChangePct;
        }
      } catch {
        // use config spot if index quote fails
      }
    }

    const instrumentChain = await buildOptionChainFromInstruments(symbol, expiry, spotPrice);
    let chain = instrumentChain ?? getOptionChain(symbol, expiry, search);
    chain = {
      ...chain,
      spotPrice,
      spotChange,
      spotChangePct,
      liveData: false,
    };

    // Fast path: structure + spot only; LTP/OI fill via chain/watch + LTP stream.
    if (fullQuotes && hasSession && session) {
      chain = await enrichOptionChainWithLiveQuotes(session.accessToken, chain);
    }

    res.json(chain);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load option chain";
    res.status(500).json({ error: message });
  }
});