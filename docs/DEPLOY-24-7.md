# Run Tradescharge 24/7 (no laptop)

Cloudflare quick tunnels only work while your PC is on. For a **permanent link**, deploy to a host (Render recommended).

## What you get

- URL like `https://tradescharge-xxxx.onrender.com` (always on with a paid plan; free tier sleeps after ~15 min idle)
- Login works without your laptop
- Each friend still uses **their own** Zerodha login

## Before you deploy

1. Push this repo to **GitHub** (private repo is fine).
2. On [developers.kite.trade](https://developers.kite.trade), add a **second** redirect URL (keep localhost for dev):
   ```
   https://YOUR-APP-NAME.onrender.com/auth/kite/callback
   ```
   You will know the exact host after the first deploy.

## Deploy on Render (≈15 minutes)

1. Sign up at [render.com](https://render.com).
2. **New → Blueprint** → connect your GitHub repo → select `render.yaml`.
3. Set **secret** environment variables in the dashboard:
   - `KITE_API_KEY`
   - `KITE_API_SECRET`
   - `SESSION_SECRET` (32+ random characters — Render can auto-generate)
   - `ANALYTICS_ADMIN_KEY` (optional)
4. After first deploy, copy your service URL, e.g. `https://tradescharge-abc.onrender.com`.
5. Set in Render env (if not set at deploy time):
   - `FRONTEND_URL` = `https://tradescharge-abc.onrender.com`
   - `KITE_REDIRECT_URL` = `https://tradescharge-abc.onrender.com/auth/kite/callback`
6. Add the same `KITE_REDIRECT_URL` in the Kite developer portal.
7. **Redeploy** once env vars are set.

## Plans

| Plan | Behavior |
|------|----------|
| Render **Free** | Sleeps when idle; cold start ~30–60s; OK for rare beta |
| Render **Starter** (~$7/mo) | Always on; use for friends / Reddit beta |

## Privacy notes for beta

- Set `KITE_AUDIT_LOG=0` on the server (already in `render.yaml`).
- Sessions are stored on the server disk; redeploy may require users to log in again unless you add a persistent disk.

## Local production test

```bash
npm run build
set NODE_ENV=production
set SERVE_FRONTEND=true
set FRONTEND_URL=http://127.0.0.1:8000
set KITE_REDIRECT_URL=http://127.0.0.1:8000/auth/kite/callback
set SESSION_SECRET=your-32-char-secret-here-minimum-length-ok
npm start
```

Open `http://127.0.0.1:8000` (single port — no Vite dev server).

## Docker

```bash
docker build -t tradescharge .
docker run -p 8000:8000 --env-file .env tradescharge
```
