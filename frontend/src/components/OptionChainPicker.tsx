import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { macroContextPollMs } from "../utils/marketHours";
import {
  fetchMarketContext,
  fetchOptionChain,
  searchStrikeInstruments,
  watchOptionChain,
} from "../api/client";
import { ExpiryPicker } from "./ExpiryPicker";
import { EditableCrudeMacroChip } from "./EditableCrudeMacroChip";
import { OptionChainTable } from "./OptionChainTable";
import { subscribeLtpStream } from "../api/client";
import { getCrudeQuoteKey } from "../utils/crudeFuturePreference";
import type {
  IndexSymbol,
  IndexTicker,
  MarketContextId,
  MarketContextQuote,
  OptionChainResponse,
  OptionLeg,
  StrikeSearchResult,
  TechnicalWatchKey,
} from "../types";
import { formatExpiryShort } from "../utils/expiry";
import { formatIndexPrice, formatMacroDayChange, pnlClass } from "../utils/format";

const WATCH_LABELS: Record<TechnicalWatchKey, string> = {
  NIFTY: "Nifty 50",
  BANKNIFTY: "Bank Nifty",
  SENSEX: "Sensex",
  GIFTNIFTY: "GIFT Nifty",
  VIX: "India VIX",
};

const WATCH_ORDER: TechnicalWatchKey[] = [
  "NIFTY",
  "BANKNIFTY",
  "SENSEX",
  "GIFTNIFTY",
  "VIX",
];

const MACRO_ORDER: MarketContextId[] = ["CRUDE_JUN", "USDINR"];

const OPTION_CHAIN_SYMBOLS: IndexSymbol[] = ["NIFTY", "BANKNIFTY", "SENSEX"];

export interface SelectedStrike {
  exchange: string;
  tradingsymbol: string;
  label: string;
  strike: number;
  instrumentType: "CE" | "PE";
  instrumentToken?: number;
  underlying: IndexSymbol;
}

interface OptionChainPickerProps {
  kiteLoggedIn?: boolean;
  indexTickers?: IndexTicker[];
  watchKey: TechnicalWatchKey;
  chainSymbol: IndexSymbol;
  onWatchKeyChange: (key: TechnicalWatchKey) => void;
  selectedStrike: SelectedStrike | null;
  onSelectStrike: (strike: SelectedStrike | null) => void;
}

function exchangeForSymbol(symbol: IndexSymbol): "NFO" | "BFO" {
  return symbol === "SENSEX" ? "BFO" : "NFO";
}

function formatMacroPrice(id: MarketContextId, price: number): string {
  if (id === "USDINR" || id === "VIX") {
    return price.toFixed(2);
  }
  return formatIndexPrice(price);
}

export function OptionChainPicker({
  kiteLoggedIn = false,
  indexTickers = [],
  watchKey,
  chainSymbol,
  onWatchKeyChange,
  selectedStrike,
  onSelectStrike,
}: OptionChainPickerProps) {
  const [chain, setChain] = useState<OptionChainResponse | null>(null);
  const [chainError, setChainError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expiry, setExpiry] = useState("");
  const [strikeSearch, setStrikeSearch] = useState("");
  const [searchHits, setSearchHits] = useState<StrikeSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [marketQuotes, setMarketQuotes] = useState<MarketContextQuote[]>([]);
  const [giftDivergencePoints, setGiftDivergencePoints] = useState<number | null>(null);
  const [crudeQuoteKey, setCrudeQuoteKey] = useState(getCrudeQuoteKey);
  const [marketContextError, setMarketContextError] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const showChain = OPTION_CHAIN_SYMBOLS.includes(watchKey as IndexSymbol);

  const quotesById = useMemo(() => {
    const map = new Map<MarketContextId, MarketContextQuote>();
    for (const q of marketQuotes) {
      map.set(q.id, q);
    }
    return map;
  }, [marketQuotes]);

  const loadMarketContext = useCallback(async () => {
    try {
      const data = await fetchMarketContext({ crudeQuoteKey });
      setMarketQuotes(data.quotes);
      setGiftDivergencePoints(data.giftDivergence?.points ?? null);
      setMarketContextError(null);
    } catch (err) {
      setMarketContextError(
        err instanceof Error ? err.message : "Failed to load market quotes",
      );
    }
  }, [crudeQuoteKey]);

  useEffect(() => {
    loadMarketContext();
    let timer = window.setInterval(loadMarketContext, macroContextPollMs());
    const rescheduler = window.setInterval(() => {
      window.clearInterval(timer);
      timer = window.setInterval(loadMarketContext, macroContextPollMs());
    }, 60_000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(rescheduler);
    };
  }, [loadMarketContext]);

  const loadChain = useCallback(async (symbol: IndexSymbol, expiryOverride?: string) => {
    setLoading(true);
    setChainError(null);
    try {
      const data = await fetchOptionChain(symbol, expiryOverride, undefined, kiteLoggedIn);
      setChain(data);
      setExpiry(data.expiry);
      setLoading(false);
      void watchOptionChain(symbol, data.expiry)
        .then((watch) => {
          if (watch.chain) {
            setChain(watch.chain);
          }
        })
        .catch(() => {
          // LTP stream may still update the chain
        });
    } catch (err) {
      console.error(err);
      setChain(null);
      setChainError(
        err instanceof Error ? err.message : "Failed to load option chain",
      );
      setLoading(false);
    }
  }, [kiteLoggedIn]);

  useEffect(() => {
    if (!showChain) {
      return;
    }
    loadChain(chainSymbol);
  }, [chainSymbol, showChain, loadChain]);

  useEffect(() => {
    if (!showChain || !expiry || expiry === chain?.expiry) return;
    loadChain(chainSymbol, expiry);
  }, [expiry, chainSymbol, chain?.expiry, showChain, loadChain]);

  useEffect(() => {
    const q = strikeSearch.trim();
    if (q.length < 2 || !showChain) {
      setSearchHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      searchStrikeInstruments(chainSymbol, q, expiry || chain?.expiry)
        .then(setSearchHits)
        .catch(() => setSearchHits([]));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [strikeSearch, chainSymbol, expiry, chain?.expiry, showChain]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!searchRef.current?.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const chainExpiry = chain?.expiry;

  useEffect(() => {
    if (!kiteLoggedIn || !chainExpiry) {
      return;
    }
    return subscribeLtpStream((payload) => {
      const streamed = payload.optionChain;
      if (
        streamed &&
        streamed.symbol === chainSymbol &&
        streamed.expiry === chainExpiry
      ) {
        setChain(streamed);
      }
    });
  }, [kiteLoggedIn, chainSymbol, chainExpiry]);

  function pickLeg(
    leg: OptionLeg,
    strike: number,
    instrumentType: "CE" | "PE",
  ) {
    onSelectStrike({
      exchange: exchangeForSymbol(chainSymbol),
      tradingsymbol: leg.tradingsymbol,
      label: `${chainSymbol} ${strike} ${instrumentType}`,
      strike,
      instrumentType,
      instrumentToken: leg.instrumentToken,
      underlying: chainSymbol,
    });
    setStrikeSearch("");
    setSearchOpen(false);
  }

  function pickSearchResult(hit: StrikeSearchResult) {
    const underlying = chainSymbol;
    onSelectStrike({
      exchange: hit.exchange,
      tradingsymbol: hit.tradingsymbol,
      label: `${underlying} ${hit.strike} ${hit.instrumentType}`,
      strike: hit.strike,
      instrumentType: hit.instrumentType,
      instrumentToken: hit.instrumentToken,
      underlying,
    });
    setStrikeSearch(String(hit.strike));
    setSearchOpen(false);
  }

  function clearStrike() {
    onSelectStrike(null);
    setStrikeSearch("");
  }

  const spot = chain?.spotPrice ?? 0;

  function renderWatchChip(key: TechnicalWatchKey) {
    const ticker =
      key === "NIFTY" || key === "BANKNIFTY" || key === "SENSEX"
        ? indexTickers.find((t) => t.symbol === key)
        : undefined;
    const macro =
      key === "GIFTNIFTY" || key === "VIX" ? quotesById.get(key) : undefined;
    const active = watchKey === key && !selectedStrike;

    return (
      <button
        key={key}
        type="button"
        className={`oc-index-chip ${active ? "active" : ""} ${key === "GIFTNIFTY" ? "gift-chip" : ""}`}
        onClick={() => {
          onWatchKeyChange(key);
          clearStrike();
        }}
      >
        <span className="oc-index-name">{WATCH_LABELS[key]}</span>
        {ticker ? (
          <>
            <span className="oc-index-spot">{formatIndexPrice(ticker.spotPrice)}</span>
            <span className={`oc-index-change ${pnlClass(ticker.spotChange)}`}>
              {ticker.spotChange > 0 ? "+" : ""}
              {formatIndexPrice(ticker.spotChange)}
            </span>
          </>
        ) : macro ? (
          <>
            <span className="oc-index-spot">{formatMacroPrice(macro.id, macro.lastPrice)}</span>
            <span className={`oc-index-change ${pnlClass(macro.change)}`}>
              {macro.change > 0 ? "+" : ""}
              {macro.id === "VIX"
                ? macro.change.toFixed(2)
                : formatMacroPrice(macro.id, Math.abs(macro.change))}
            </span>
            {key === "GIFTNIFTY" && giftDivergencePoints != null && (
              <span
                className={`gift-divergence ${giftDivergencePoints >= 0 ? "positive" : "negative"}`}
                title="GIFT Nifty vs Nifty 50 spot (points)"
              >
                {giftDivergencePoints >= 0 ? "+" : ""}
                {giftDivergencePoints.toFixed(2)} vs spot
              </span>
            )}
          </>
        ) : (
          <span className="oc-index-spot muted" title={marketContextError ?? undefined}>
            {kiteLoggedIn ? "…" : "Login"}
          </span>
        )}
      </button>
    );
  }

  function renderMacroChip(id: MarketContextId) {
    if (id === "CRUDE_JUN") {
      return (
        <EditableCrudeMacroChip
          key={id}
          quote={quotesById.get(id)}
          crudeQuoteKey={crudeQuoteKey}
          kiteLoggedIn={kiteLoggedIn}
          onQuoteKeyChange={setCrudeQuoteKey}
        />
      );
    }

    const quote = quotesById.get(id);

    return (
      <div
        key={id}
        className="macro-quote-chip"
        title={
          id === "USDINR"
            ? quote?.source === "kite"
              ? "USD/INR NSE-CD via Kite ticks when stream is active; otherwise REST"
              : quote?.source === "morningstar"
                ? "USD/INR via Morningstar (matches Google spot)"
                : quote?.source === "yahoo"
                  ? "USD/INR via Yahoo (fallback)"
                  : quote?.source
                    ? `USD/INR (${quote.source})`
                    : "USD/INR — loading"
            : undefined
        }
      >
        <span className="macro-quote-label">
          {id === "USDINR" ? "USD/INR" : id}
          {id === "USDINR" && quote?.source === "kite" && (
            <span className="macro-quote-source"> · Kite</span>
          )}
          {id === "USDINR" && quote?.source === "morningstar" && (
            <span className="macro-quote-source"> · MS</span>
          )}
          {id === "USDINR" && quote?.source === "yahoo" && (
            <span className="macro-quote-source"> · Yahoo</span>
          )}
        </span>
        {quote ? (
          <>
            <span className="macro-quote-price">{formatMacroPrice(id, quote.lastPrice)}</span>
            <span className={`macro-quote-change ${pnlClass(quote.change)}`}>
              {formatMacroDayChange(id, quote.change)}
            </span>
          </>
        ) : (
          <span
            className="macro-quote-price muted"
            title={marketContextError ?? "USD/INR quote unavailable"}
          >
            …
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="option-chain-panel technicals-chain">
      <div className="oc-index-strip technicals-watch-strip">
        {WATCH_ORDER.map((key) => renderWatchChip(key))}
      </div>

      <div className="macro-context-strip" aria-label="Macro quotes">
        {marketContextError && (
          <p className="macro-context-error muted">{marketContextError}</p>
        )}
        {MACRO_ORDER.map((id) => renderMacroChip(id))}
      </div>

      {selectedStrike && (
        <div className="technicals-selection-banner">
          <span>
            Strike: <strong>{selectedStrike.label}</strong>
          </span>
          <button type="button" className="btn btn-sm" onClick={clearStrike}>
            Back to index
          </button>
        </div>
      )}

      {showChain && chain && (
        <>
          <ExpiryPicker expiries={chain.expiries} value={expiry} onChange={setExpiry} />

          <div className="chain-controls">
            <div className="strike-search-wrap" ref={searchRef}>
              <input
                type="search"
                className="chain-strike-search"
                placeholder={`${WATCH_LABELS[chainSymbol]} strike…`}
                value={strikeSearch}
                onChange={(e) => {
                  setStrikeSearch(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                aria-label="Search strikes"
              />
              {searchOpen && searchHits.length > 0 && (
                <ul className="strike-search-dropdown">
                  {searchHits.map((hit) => (
                    <li key={hit.tradingsymbol}>
                      <button type="button" onClick={() => pickSearchResult(hit)}>
                        <span className={`leg-type ${hit.instrumentType.toLowerCase()}`}>
                          {hit.instrumentType}
                        </span>
                        <span>{hit.strike}</span>
                        <span className="muted">{formatExpiryShort(hit.expiry)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <span className="chain-as-on muted">
              Spot {formatIndexPrice(spot)} · pick CE or PE on a strike row
            </span>
          </div>

          {loading ? (
            <p className="chain-loading">Loading option chain…</p>
          ) : chainError ? (
            <p className="technicals-error">{chainError}</p>
          ) : chain ? (
            <OptionChainTable
              chain={chain}
              chainSymbol={chainSymbol}
              selectedStrike={selectedStrike}
              strikeSearch={strikeSearch}
              onPickCe={(leg, strike) => pickLeg(leg, strike, "CE")}
              onPickPe={(leg, strike) => pickLeg(leg, strike, "PE")}
            />
          ) : (
            <p className="chain-loading muted">No chain data</p>
          )}
        </>
      )}

      {!showChain && (
        <p className="technicals-hint">
          {WATCH_LABELS[watchKey]} — select for multi-timeframe indicators. Use Nifty / Bank Nifty /
          Sensex for option strikes.
        </p>
      )}
    </div>
  );
}
