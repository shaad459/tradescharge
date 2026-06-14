import { useMemo } from "react";
import type { PnLSnapshot } from "../types";
import { formatCurrency, formatPercentChange } from "../utils/format";
import { formatIstChartTime } from "../utils/datetime";
import { pctOfCapital } from "../utils/portfolio";

interface PnLChartProps {
  history: PnLSnapshot[];
}

const CHART_WIDTH = 900;
const CHART_HEIGHT = 280;
const PADDING = { top: 24, right: 24, bottom: 40, left: 64 };

function scaleValue(value: number, min: number, max: number, height: number): number {
  if (max === min) {
    return height / 2;
  }
  return height - ((value - min) / (max - min)) * height;
}

function buildLinePath(
  values: number[],
  plotWidth: number,
  plotHeight: number,
  minY: number,
  maxY: number,
): string {
  if (values.length === 0) {
    return "";
  }

  return values
    .map((value, index) => {
      const x = values.length === 1 ? plotWidth / 2 : (index / (values.length - 1)) * plotWidth;
      const y = scaleValue(value, minY, maxY, plotHeight);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(
  values: number[],
  baseline: number,
  plotWidth: number,
  plotHeight: number,
  minY: number,
  maxY: number,
): string {
  if (values.length === 0) {
    return "";
  }

  const line = values
    .map((value, index) => {
      const x = values.length === 1 ? plotWidth / 2 : (index / (values.length - 1)) * plotWidth;
      const y = scaleValue(value, minY, maxY, plotHeight);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const lastX = values.length === 1 ? plotWidth / 2 : plotWidth;
  const firstX = values.length === 1 ? plotWidth / 2 : 0;
  const baseY = scaleValue(baseline, minY, maxY, plotHeight);

  return `${line} L ${lastX.toFixed(2)} ${baseY.toFixed(2)} L ${firstX.toFixed(2)} ${baseY.toFixed(2)} Z`;
}

function portfolioIndex(point: PnLSnapshot): number {
  return 100 + pctOfCapital(point.netPnL, point.capital);
}

function chargesIndex(point: PnLSnapshot): number {
  return 100 - pctOfCapital(point.totalCharges, point.capital);
}

function computeDomain(values: number[], baseline: number): { minY: number; maxY: number } {
  const min = Math.min(...values, baseline);
  const max = Math.max(...values, baseline);
  const span = max - min;
  const pad = span < 0.2 ? 0.35 : Math.max(span * 0.18, 0.08);
  return {
    minY: min - pad,
    maxY: max + pad,
  };
}

function buildYTicks(minY: number, maxY: number, baseline: number): number[] {
  const span = maxY - minY;
  const step =
    span <= 0.8 ? 0.1 : span <= 2 ? 0.25 : span <= 5 ? 0.5 : span <= 12 ? 1 : 2;

  const ticks: number[] = [];
  const start = Math.ceil(minY / step) * step;
  for (let value = start; value <= maxY + step * 0.01; value += step) {
    ticks.push(Math.round(value * 100) / 100);
  }

  if (!ticks.some((tick) => Math.abs(tick - baseline) < step * 0.05)) {
    ticks.push(baseline);
  }

  return [...new Set(ticks)].sort((a, b) => a - b);
}

export function PnLChart({ history }: PnLChartProps) {
  const latest = history[history.length - 1];

  const chart = useMemo(() => {
    if (history.length === 0) {
      return null;
    }

    const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
    const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
    const baseline = 100;

    const portfolioValues = history.map(portfolioIndex);
    const chargesValues = history.map(chargesIndex);
    const allValues = [...portfolioValues, ...chargesValues, baseline];
    const { minY, maxY } = computeDomain(allValues, baseline);

    const portfolioPath = buildLinePath(portfolioValues, plotWidth, plotHeight, minY, maxY);
    const chargesPath = buildLinePath(chargesValues, plotWidth, plotHeight, minY, maxY);
    const portfolioAreaPath = buildAreaPath(
      portfolioValues,
      baseline,
      plotWidth,
      plotHeight,
      minY,
      maxY,
    );
    const baselineY = scaleValue(baseline, minY, maxY, plotHeight);
    const yTicks = buildYTicks(minY, maxY, baseline);

    const xLabels =
      history.length <= 1
        ? [{ x: plotWidth / 2, label: formatIstChartTime(history[0].timestamp) }]
        : [0, Math.floor(history.length / 2), history.length - 1].map((index) => ({
            x: (index / (history.length - 1)) * plotWidth,
            label: formatIstChartTime(history[index].timestamp),
          }));

    const lastIndex = history.length - 1;
    const lastX =
      history.length === 1 ? plotWidth / 2 : (lastIndex / (history.length - 1)) * plotWidth;

    return {
      plotWidth,
      plotHeight,
      minY,
      maxY,
      baseline,
      baselineY,
      portfolioPath,
      chargesPath,
      portfolioAreaPath,
      yTicks,
      xLabels,
      lastX,
      lastPortfolioY: scaleValue(portfolioValues[lastIndex], minY, maxY, plotHeight),
      lastChargesY: scaleValue(chargesValues[lastIndex], minY, maxY, plotHeight),
      portfolioValues,
      chargesValues,
    };
  }, [history]);

  if (!chart || !latest) {
    return (
      <section className="panel chart-panel">
        <h2>P&amp;L vs Capital</h2>
        <div className="chart-empty">Waiting for market data…</div>
      </section>
    );
  }

  const latestChargesPct = pctOfCapital(latest.totalCharges, latest.capital);
  const latestPortfolioIndex = portfolioIndex(latest);
  const netPositive = latest.netPnL >= 0;

  return (
    <section className="panel chart-panel">
      <div className="chart-header">
        <div>
          <h2>P&amp;L vs Capital</h2>
          <p className="chart-subtitle">
            Indexed to capital at 100% · Base {formatCurrency(latest.capital)}
          </p>
        </div>
        <div className="chart-summary">
          <div>
            <span>Net P&amp;L</span>
            <strong className={netPositive ? "positive" : "negative"}>
              {formatCurrency(latest.netPnL)}
            </strong>
            <span className={`chart-summary-pct ${netPositive ? "positive" : "negative"}`}>
              {formatPercentChange(latestPortfolioIndex - 100)} vs capital
            </span>
          </div>
          <div>
            <span>Charges</span>
            <strong className="charges-color">{formatCurrency(latest.totalCharges)}</strong>
            <span className="chart-summary-pct charges-color">
              {formatPercentChange(latestChargesPct)} of capital
            </span>
          </div>
        </div>
      </div>

      <div className="chart-legend">
        <span className="legend-item net">Portfolio (net, indexed)</span>
        <span className="legend-item capital">Capital (100%)</span>
        <span className="legend-item charges">After charges (indexed)</span>
      </div>

      <div className="chart-plot-wrap">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="pnl-chart"
          role="img"
          aria-label="Portfolio net P and L and charges indexed to capital"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="portfolio-area-up" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--green)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--green)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="portfolio-area-down" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="var(--red)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--red)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <rect
            x={PADDING.left}
            y={PADDING.top}
            width={chart.plotWidth}
            height={chart.plotHeight}
            className="chart-plot-bg"
            rx="8"
          />

          <g transform={`translate(${PADDING.left}, ${PADDING.top})`}>
            {chart.yTicks.map((tick) => {
              const y = scaleValue(tick, chart.minY, chart.maxY, chart.plotHeight);
              const isBaseline = Math.abs(tick - chart.baseline) < 0.001;
              return (
                <g key={tick}>
                  <line
                    x1={0}
                    x2={chart.plotWidth}
                    y1={y}
                    y2={y}
                    className={isBaseline ? "chart-capital-line" : "chart-grid-line"}
                  />
                  <text x={-12} y={y + 4} textAnchor="end" className="chart-axis-label">
                    {tick.toFixed(tick % 1 === 0 ? 0 : 1)}%
                  </text>
                </g>
              );
            })}

            <path
              d={chart.portfolioAreaPath}
              className={`chart-area ${netPositive ? "up" : "down"}`}
              fill={netPositive ? "url(#portfolio-area-up)" : "url(#portfolio-area-down)"}
            />

            <path d={chart.chargesPath} className="chart-line charges" fill="none" />
            <path
              d={chart.portfolioPath}
              className={`chart-line net${netPositive ? "" : " negative"}`}
              fill="none"
            />

            <circle cx={chart.lastX} cy={chart.lastChargesY} r={4} className="chart-dot charges" />
            <circle
              cx={chart.lastX}
              cy={chart.lastPortfolioY}
              r={4.5}
              className={`chart-dot net${netPositive ? "" : " negative"}`}
            />
          </g>

          {chart.xLabels.map((label) => (
            <text
              key={label.label}
              x={PADDING.left + label.x}
              y={CHART_HEIGHT - 10}
              textAnchor="middle"
              className="chart-axis-label"
            >
              {label.label}
            </text>
          ))}
        </svg>
      </div>
    </section>
  );
}
