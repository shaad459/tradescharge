import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { fetchTechnicalsChart, type TechnicalsStreamParams } from "../api/client";
import type {
  PriceActionBias,
  PriceActionInsight,
  TechnicalsChartResponse,
} from "../types";

const CHART_HEIGHT = 280;

const CHART_TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "1D"] as const;
type ChartTf = (typeof CHART_TIMEFRAMES)[number];

const STORAGE_OPEN = "tc-price-chart-open";

function chartTheme() {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    dark,
    bg: "transparent",
    text: dark ? "#a1a1aa" : "#52525b",
    grid: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
    up: dark ? "#22c55e" : "#16a34a",
    down: dark ? "#ef4444" : "#dc2626",
    ma20: dark ? "#60a5fa" : "#2563eb",
    ma50: dark ? "#f97316" : "#ea580c",
    vwap: dark ? "#a78bfa" : "#7c3aed",
  };
}

function streamParamsKey(params: TechnicalsStreamParams | null): string {
  if (!params) {
    return "";
  }
  if ("index" in params && params.index) {
    return `index:${params.index}`;
  }
  return `leg:${params.instrumentToken ?? 0}:${params.exchange}:${params.tradingsymbol}`;
}

function insightClass(bias: PriceActionBias): string {
  if (bias === "bullish") return "pa-insight bull";
  if (bias === "bearish") return "pa-insight bear";
  return "pa-insight neutral";
}

interface PriceActionChartPanelProps {
  kiteLoggedIn: boolean;
  streamParams: TechnicalsStreamParams | null;
}

export function PriceActionChartPanel({ kiteLoggedIn, streamParams }: PriceActionChartPanelProps) {
  const [open, setOpen] = useState(() => localStorage.getItem(STORAGE_OPEN) === "1");
  const [tf, setTf] = useState<ChartTf>("15m");
  const [chartData, setChartData] = useState<TechnicalsChartResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paramsKey = useMemo(() => streamParamsKey(streamParams), [streamParams]);
  const streamParamsRef = useRef(streamParams);
  streamParamsRef.current = streamParams;

  const chartWrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ma20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ma50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapRef = useRef<ISeriesApi<"Line"> | null>(null);
  const fitViewRef = useRef(true);

  const toggleOpen = () => {
    setOpen((v) => {
      const next = !v;
      localStorage.setItem(STORAGE_OPEN, next ? "1" : "0");
      if (next) {
        fitViewRef.current = true;
      }
      return next;
    });
  };

  const loadChart = useCallback(
    async (resetView = false) => {
      const params = streamParamsRef.current;
      if (!kiteLoggedIn || !params) {
        return;
      }
      if (resetView) {
        fitViewRef.current = true;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await fetchTechnicalsChart({ ...params, tf });
        setChartData(data);
      } catch (err) {
        setChartData(null);
        setError(err instanceof Error ? err.message : "Failed to load chart");
      } finally {
        setLoading(false);
      }
    },
    [kiteLoggedIn, tf],
  );

  useEffect(() => {
    fitViewRef.current = true;
    setChartData(null);
  }, [paramsKey, tf]);

  useEffect(() => {
    if (!open || !paramsKey) {
      return;
    }
    void loadChart(true);
    const timer = window.setInterval(() => void loadChart(false), 90_000);
    return () => window.clearInterval(timer);
  }, [open, paramsKey, tf, loadChart]);

  useEffect(() => {
    if (!open || !containerRef.current || !chartWrapRef.current) {
      return;
    }

    const theme = chartTheme();
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: theme.bg },
        textColor: theme.text,
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      crosshair: { vertLine: { labelVisible: true }, horzLine: { labelVisible: true } },
      width: chartWrapRef.current.clientWidth,
      height: CHART_HEIGHT,
    });

    const candles = chart.addCandlestickSeries({
      upColor: theme.up,
      downColor: theme.down,
      borderVisible: false,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
    });

    const ma20 = chart.addLineSeries({ color: theme.ma20, lineWidth: 2, title: "MA20" });
    const ma50 = chart.addLineSeries({ color: theme.ma50, lineWidth: 2, title: "MA50" });
    const vwap = chart.addLineSeries({
      color: theme.vwap,
      lineWidth: 2,
      lineStyle: 2,
      title: "VWAP",
    });

    chartRef.current = chart;
    candleRef.current = candles;
    ma20Ref.current = ma20;
    ma50Ref.current = ma50;
    vwapRef.current = vwap;

    const applyWidth = () => {
      if (chartWrapRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartWrapRef.current.clientWidth });
      }
    };
    const ro = new ResizeObserver(applyWidth);
    ro.observe(chartWrapRef.current);
    applyWidth();

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      ma20Ref.current = null;
      ma50Ref.current = null;
      vwapRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !chartData || !candleRef.current) {
      return;
    }

    candleRef.current.setData(
      chartData.candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    ma20Ref.current?.setData(
      chartData.ma20Line.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );
    ma50Ref.current?.setData(
      chartData.ma50Line.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );
    vwapRef.current?.setData(
      chartData.vwapLine.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );

    if (fitViewRef.current && chartRef.current) {
      chartRef.current.timeScale().fitContent();
      fitViewRef.current = false;
    }
  }, [chartData, open]);

  if (!kiteLoggedIn) {
    return null;
  }

  return (
    <div className="pa-chart-panel">
      <button
        type="button"
        className="pa-chart-toggle"
        onClick={toggleOpen}
        aria-expanded={open}
      >
        <span className="pa-chart-toggle-title">Price action chart</span>
        <span className="muted">{open ? "Hide" : "Show"} candles &amp; signals</span>
      </button>

      {open && (
        <div className="pa-chart-body">
          <div className="pa-chart-toolbar">
            <div className="pa-chart-tf-group" role="group" aria-label="Chart timeframe">
              {CHART_TIMEFRAMES.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`pa-chart-tf-btn ${tf === id ? "active" : ""}`}
                  onClick={() => {
                    setTf(id);
                    fitViewRef.current = true;
                  }}
                >
                  {id}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void loadChart(true)}
              disabled={loading}
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {error && <p className="technicals-error">{error}</p>}
          {loading && !chartData && <p className="chain-loading muted">Loading candles…</p>}

          <div className="pa-chart-row">
            <div ref={chartWrapRef} className="pa-chart-main">
              <div ref={containerRef} className="pa-chart-canvas" style={{ height: CHART_HEIGHT }} />
            </div>
          </div>

          {chartData && (
            <>
              <p className="pa-chart-headline">
                <strong>{chartData.priceAction.headline}</strong>
                <span className="muted">
                  {" "}
                  · {chartData.label} · {chartData.timeframeLabel} · Last{" "}
                  {chartData.lastPrice.toFixed(2)}
                  {chartData.sessionVwap != null && (
                    <> · VWAP {chartData.sessionVwap.toFixed(2)}</>
                  )}
                </span>
              </p>
              <ul className="pa-insight-list">
                {chartData.priceAction.insights.map((item: PriceActionInsight, idx: number) => (
                  <li key={`${item.label}-${idx}`} className={insightClass(item.bias)}>
                    {item.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
