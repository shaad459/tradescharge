# Tradescharge

Real-time Nifty 50 options P&L for Zerodha traders — with live transaction cost breakdown (brokerage, STT, exchange fees, SEBI, GST, stamp duty).

## Quick start

```bash
# Install dependencies
npm run install:all
npm install

# Run backend + frontend (view-only — default)
npm run dev
```

Open **http://127.0.0.1:5173** — read-only dashboard; trade on Kite.

Optional trading build (order pad + buy/sell from Tradescharge):

```bash
npm run dev:trade
```

Open **http://127.0.0.1:5174**

## Configuration

Copy `.env.example` to `.env` and fill in:

| Variable | Description |
|---|---|
| `KITE_API_KEY` | From [Kite Connect developer portal](https://developers.kite.trade/create) |
| `KITE_API_SECRET` | Same portal (server only — never commit) |
| `KITE_REDIRECT_URL` | `http://127.0.0.1:8000/auth/kite/callback` |

## Modes

- **View-only** (default, `npm run dev`): Net P&L, charges, breakeven, option chain — no orders placed from Tradescharge. Trade on Kite.
- **Trading build** (`npm run dev:trade`): Same dashboard plus order pad and buy/sell from the app (kept for possible future use).
- **Demo mode**: Mock positions with simulated LTP ticks. Works without API secret.
- **Live mode**: After adding `KITE_API_SECRET`, click "Login with Zerodha" to fetch real balance and positions.

## Features (Phase 1)

- Capital balance header (updates with open position net P&L)
- Per-position: buy price, LTP, SL, target, gross & net P&L
- Dynamic charge breakdown (entry + exit at current LTP)
- Breakeven calculator with adjustable lots

## Charge engine

Validated against the PRD contract note example (₹17.46L turnover → ₹2,415.61 total charges).

```bash
npm run test
```

## Share with friends (cloud)

| Host | Guide | Best for |
|------|--------|----------|
| **Vercel** | [docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md) | Quick shareable `*.vercel.app` link |
| **Render** | [docs/DEPLOY-24-7.md](docs/DEPLOY-24-7.md) | Always-on, fewer cold starts |

Each visitor logs in with **their own** Zerodha account (your Kite Connect app key is shared; sessions are per user). Add your production callback URL on [developers.kite.trade](https://developers.kite.trade).

## Project structure

```
backend/     Express API, charge engine, Kite OAuth
frontend/    React dashboard
api/         Vercel serverless entry
docs/        PRD + deploy guides
```
