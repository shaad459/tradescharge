import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  fetchTechnicals,
  subscribeTechnicalsStream,
  type TechnicalsStreamParams,
} from "../api/client";
import { InstrumentSearchBar, type SelectedInstrument } from "./InstrumentSearchBar";
import { OptionChainPicker, type SelectedStrike } from "./OptionChainPicker";
import { PriceActionChartPanel } from "./PriceActionChartPanel";
import type {
  EmaCrossAlignment,
  EmaCrossover,
  EmaPosition,
  IndexSymbol,
  IndexTicker,
  RsiSignal,
  StochRsiDirection,
  StochRsiSignal,
  TechnicalsResponse,
  TechnicalTimeframeRow,
  TechnicalWatchKey,
  WilliamsZone,
} from "../types";

interface TechnicalsPanelProps {
  kiteLoggedIn: boolean;
  indexTickers?: IndexTicker[];
}

function fmtNum(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function emaLabel(pos: EmaPosition | null): string {
  if (!pos) return "—";
  return pos === "above" ? "Above" : "Below";
}

function emaClass(pos: EmaPosition | null): string {
  if (!pos) return "muted";
  return pos === "above" ? "positive" : "negative";
}

function williamsLabel(zone: WilliamsZone | null): string {
  if (!zone) return "—";
  if (zone === "above_-20") return "Above −20";
  if (zone === "below_-80") return "Below −80";
  return "Mid";
}

function williamsClass(zone: WilliamsZone | null): string {
  if (zone === "above_-20") return "positive";
  if (zone === "below_-80") return "negative";
  return "muted";
}

function rsiSignalLabel(signal: RsiSignal | null): string {
  if (!signal) return "—";
  if (signal === "overbought") return "≥ 80";
  if (signal === "oversold") return "≤ 20";
  return "Neutral";
}

function rsiSignalClass(signal: RsiSignal | null): string {
  if (signal === "overbought") return "rsi-overbought";
  if (signal === "oversold") return "rsi-oversold";
  return "muted";
}

function IndicatorStackCell({
  value,
  sub,
  className,
}: {
  value: ReactNode;
  sub: ReactNode;
  className?: string;
}) {
  return (
    <td className={className}>
      <span className="technicals-ema-value">{value}</span>
      <span className="technicals-ema-pos">{sub}</span>
    </td>
  );
}

function EmaCell({ value, position }: { value: number | null; position: EmaPosition | null }) {
  return (
    <IndicatorStackCell
      className={emaClass(position)}
      value={fmtNum(value)}
      sub={emaLabel(position)}
    />
  );
}

function crossAlignLabel(align: EmaCrossAlignment | null): string {
  if (!align) return "—";
  return align === "bullish" ? "Bull" : "Bear";
}

function crossAlignClass(align: EmaCrossAlignment | null): string {
  if (!align) return "muted";
  return align === "bullish" ? "positive" : "negative";
}

function crossEventLabel(cross: EmaCrossover | null): string {
  if (!cross) return "—";
  return cross === "bullish_cross" ? "Cross ↑" : "Cross ↓";
}

function crossEventClass(cross: EmaCrossover | null): string {
  if (cross === "bullish_cross") return "positive";
  if (cross === "bearish_cross") return "negative";
  return "muted";
}

function EmaCrossCell({
  alignment,
  crossover,
}: {
  alignment: EmaCrossAlignment | null;
  crossover: EmaCrossover | null;
}) {
  return (
    <IndicatorStackCell
      className={crossAlignClass(alignment)}
      value={crossAlignLabel(alignment)}
      sub={<span className={crossEventClass(crossover)}>{crossEventLabel(crossover)}</span>}
    />
  );
}

function stochRsiSignalLabel(signal: StochRsiSignal | null): string {
  if (!signal) return "—";
  if (signal === "long") return "↑ from ≤20";
  if (signal === "short") return "↓ from ≥80";
  return "—";
}

function stochRsiSignalClass(signal: StochRsiSignal | null): string {
  if (signal === "long") return "positive";
  if (signal === "short") return "negative";
  return "muted";
}

function stochRsiDirectionLabel(direction: StochRsiDirection | null): string {
  if (!direction) return "—";
  if (direction === "rising") return "Rising";
  if (direction === "falling") return "Falling";
  return "Flat";
}

function stochRsiDirectionClass(
  direction: StochRsiDirection | null,
  signal: StochRsiSignal | null,
): string {
  if (signal === "long") return "positive";
  if (signal === "short") return "negative";
  if (direction === "rising") return "positive";
  if (direction === "falling") return "negative";
  return "muted";
}

function StochRsiCell({
  value,
  signal,
  direction,
}: {
  value: number | null;
  signal: StochRsiSignal | null;
  direction: StochRsiDirection | null;
}) {
  return (
    <IndicatorStackCell
      className={stochRsiSignalClass(signal)}
      value={fmtNum(value)}
      sub={
        <span className={stochRsiDirectionClass(direction, signal)}>
          {signal && signal !== "neutral"
            ? stochRsiSignalLabel(signal)
            : stochRsiDirectionLabel(direction)}
        </span>
      }
    />
  );
}

function RsiCell({ value, signal }: { value: number | null; signal: RsiSignal | null }) {
  return (
    <IndicatorStackCell
      value={fmtNum(value)}
      sub={<span className={rsiSignalClass(signal)}>{rsiSignalLabel(signal)}</span>}
    />
  );
}

function WilliamsCell({ value, zone }: { value: number | null; zone: WilliamsZone | null }) {
  return (
    <IndicatorStackCell
      value={fmtNum(value)}
      sub={<span className={williamsClass(zone)}>{williamsLabel(zone)}</span>}
    />
  );
}

function VwapCell({ vwap, position }: { vwap: number | null; position: EmaPosition | null }) {
  return (
    <IndicatorStackCell
      className={emaClass(position)}
      value={fmtNum(vwap)}
      sub={emaLabel(position)}
    />
  );
}

function closeVsPrevClass(lastClose: number, previousDayClose: number | null): string {
  if (previousDayClose == null || !Number.isFinite(previousDayClose) || previousDayClose <= 0) {
    return "";
  }
  if (lastClose > previousDayClose) {
    return "positive";
  }
  if (lastClose < previousDayClose) {
    return "negative";
  }
  return "muted";
}

function TimeframeTable({ rows }: { rows: TechnicalTimeframeRow[] }) {
  return (
    <div className="technicals-table-wrap">
      <table className="technicals-table">
        <thead>
          <tr>
            <th>TF</th>
            <th>Close</th>
            <th>RSI (14, 80/20)</th>
            <th>Stoch RSI (14, 80/20)</th>
            <th>Williams %R</th>
            <th>MA 20</th>
            <th>MA 50</th>
            <th>MA 100</th>
            <th>MA 200</th>
            <th>20×50</th>
            <th>50×100</th>
            <th>50×200</th>
            <th>VWAP (TF)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.timeframe}>
              <th scope="row">{row.label}</th>
              <td className={closeVsPrevClass(row.lastClose, row.previousDayClose)}>
                {fmtNum(row.lastClose)}
              </td>
              <RsiCell value={row.rsi14} signal={row.rsiSignal} />
              <StochRsiCell
                value={row.stochRsi}
                signal={row.stochRsiSignal}
                direction={row.stochRsiDirection}
              />
              <WilliamsCell value={row.williamsR14} zone={row.williamsZone} />
              <EmaCell value={row.ema20Value} position={row.ema20} />
              <EmaCell value={row.ema50Value} position={row.ema50} />
              <EmaCell value={row.ema100Value} position={row.ema100} />
              <EmaCell value={row.ema200Value} position={row.ema200} />
              <EmaCrossCell
                alignment={row.emaCross2050Alignment}
                crossover={row.emaCross2050Crossover}
              />
              <EmaCrossCell
                alignment={row.emaCross50100Alignment}
                crossover={row.emaCross50100Crossover}
              />
              <EmaCrossCell
                alignment={row.emaCross50200Alignment}
                crossover={row.emaCross50200Crossover}
              />
              <VwapCell vwap={row.sessionVwap} position={row.vwapPosition} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isOptionChainKey(key: TechnicalWatchKey): key is IndexSymbol {
  return key === "NIFTY" || key === "BANKNIFTY" || key === "SENSEX";
}

export function TechnicalsPanel({ kiteLoggedIn, indexTickers }: TechnicalsPanelProps) {
  const [watchKey, setWatchKey] = useState<TechnicalWatchKey>("NIFTY");
  const [chainSymbol, setChainSymbol] = useState<IndexSymbol>("NIFTY");
  const [selectedStrike, setSelectedStrike] = useState<SelectedStrike | null>(null);
  const [customInstrument, setCustomInstrument] = useState<SelectedInstrument | null>(null);
  const [data, setData] = useState<TechnicalsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamGeneration = useRef(0);
  const hasDataRef = useRef(false);

  const streamParams = useCallback((): TechnicalsStreamParams | null => {
    if (!kiteLoggedIn) {
      return null;
    }
    if (customInstrument) {
      return {
        exchange: customInstrument.exchange,
        tradingsymbol: customInstrument.tradingsymbol,
        instrumentToken: customInstrument.instrumentToken,
      };
    }
    if (selectedStrike) {
      return {
        exchange: selectedStrike.exchange,
        tradingsymbol: selectedStrike.tradingsymbol,
        instrumentToken: selectedStrike.instrumentToken,
      };
    }
    return { index: watchKey };
  }, [kiteLoggedIn, watchKey, selectedStrike, customInstrument]);

  const chartStreamParams = useMemo(() => streamParams(), [streamParams]);

  useEffect(() => {
    const params = streamParams();
    if (!params) {
      hasDataRef.current = false;
      setData(null);
      setLive(false);
      setError("Log in to Zerodha for live multi-timeframe indicators.");
      return;
    }

    const generation = ++streamGeneration.current;
    hasDataRef.current = false;
    setLoading(true);
    setError(null);
    setLive(false);

    fetchTechnicals(params)
      .then((snapshot) => {
        if (generation !== streamGeneration.current) {
          return;
        }
        hasDataRef.current = true;
        setData(snapshot);
        setLoading(false);
        setError(null);
      })
      .catch((err) => {
        if (generation !== streamGeneration.current) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load technicals");
        setLoading(false);
      });

    const unsubscribe = subscribeTechnicalsStream(
      params,
      (payload) => {
        if (generation !== streamGeneration.current) {
          return;
        }
        hasDataRef.current = true;
        setData(payload);
        setLoading(false);
        setLive(true);
        setError(null);
      },
      () => {
        if (generation !== streamGeneration.current) {
          return;
        }
        if (!hasDataRef.current) {
          setError("Live stream unavailable — showing last snapshot when ready.");
          setLoading(false);
        }
      },
      { bootstrapOnly: true, deferMs: 4000 },
    );

    return () => {
      unsubscribe();
    };
  }, [streamParams]);

  function onWatchKeyChange(key: TechnicalWatchKey) {
    setWatchKey(key);
    setCustomInstrument(null);
    setSelectedStrike(null);
    if (isOptionChainKey(key)) {
      setChainSymbol(key);
    }
  }

  const subjectLabel =
    customInstrument?.label ?? selectedStrike?.label ?? data?.label ?? watchKey;

  const subjectKind = customInstrument
    ? "Instrument"
    : selectedStrike
      ? "Option strike"
      : data?.kind === "index"
        ? "Index"
        : "Instrument";

  return (
    <section className="panel technicals-panel" aria-label="Technical indicators">
      <header className="technicals-header">
        <div>
          <h2>Technical intelligence</h2>
          <p className="technicals-subtitle">
            Loads instantly from Kite candles; when the market is open, values update on each tick.
            EMA crosses: Bull/Bear = faster above slower; Cross ↑/↓ = fresh crossover on the latest bar.
          </p>
        </div>
        {live && !loading && (
          <span className="technicals-live-badge" title="Updating on Kite ticks">
            Live ticks
          </span>
        )}
        {!live && data && !loading && (
          <span className="technicals-live-badge muted-badge" title="Snapshot — ticks resume when market is open">
            Snapshot
          </span>
        )}
      </header>

      <InstrumentSearchBar
        disabled={!kiteLoggedIn}
        selected={customInstrument}
        onSelect={(inst) => {
          setCustomInstrument(inst);
          setSelectedStrike(null);
        }}
        onClear={() => setCustomInstrument(null)}
      />

      <OptionChainPicker
        kiteLoggedIn={kiteLoggedIn}
        indexTickers={indexTickers}
        watchKey={watchKey}
        chainSymbol={chainSymbol}
        onWatchKeyChange={onWatchKeyChange}
        selectedStrike={selectedStrike}
        onSelectStrike={(strike) => {
          setSelectedStrike(strike);
          setCustomInstrument(null);
        }}
      />

      <div className="technicals-result">
        <h3 className="technicals-subject">
          {subjectKind}: <strong>{subjectLabel}</strong>
          {data?.lastPrice != null && (
            <span className="technicals-last"> · Last {fmtNum(data.lastPrice)}</span>
          )}
          {data?.previousDayClose != null && (
            <span className="technicals-last"> · Prev close {fmtNum(data.previousDayClose)}</span>
          )}
          {data?.previousDayHigh != null && (
            <span className="technicals-last"> · Prev high {fmtNum(data.previousDayHigh)}</span>
          )}
          {data?.previousDayLow != null && (
            <span className="technicals-last"> · Prev low {fmtNum(data.previousDayLow)}</span>
          )}
          {data?.sessionVwap != null && selectedStrike && (
            <span className="technicals-last"> · 1m VWAP {fmtNum(data.sessionVwap)}</span>
          )}
        </h3>

        {!kiteLoggedIn && (
          <p className="technicals-hint">Connect Zerodha for live indicators from Kite.</p>
        )}

        {error && <p className="technicals-error">{error}</p>}

        <PriceActionChartPanel
          kiteLoggedIn={kiteLoggedIn}
          streamParams={chartStreamParams}
        />

        {loading && !data && (
          <p className="chain-loading">Loading history and connecting live stream…</p>
        )}

        {data && data.timeframes.length > 0 && <TimeframeTable rows={data.timeframes} />}

        {data && (
          <p className="technicals-as-of muted">
            {live ? "Live" : "Snapshot"} as of{" "}
            {new Date(data.asOf).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · VWAP uses
            today&apos;s session bars (equal-weight if option volume is zero) · EMAs use all available
            history (longer periods need more bars)
          </p>
        )}
      </div>
    </section>
  );
}
