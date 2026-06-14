# Deploy Tradescharge on Vercel (shareable link)

Use this when you want a URL like `https://tradescharge.vercel.app` to send to friends.

## How it works for friends

- **Yes — each friend logs in with their own Zerodha (Kite) account.** The app uses your Kite Connect **app** (API key + secret you configure on Vercel), but after login each person only sees **their** positions, balance, and market data tied to **their** session.
- **No — they do not use your Zerodha login.** Sessions are isolated per browser (encrypted cookies).
- **Same features as you** after login: dashboard, option chain, technicals, macro quotes (USD/INR works without login). Live LTP streaming uses Server-Sent Events and may reconnect more often on Vercel than on a always-on server (Render).

## Before you deploy

1. Push this repo to **GitHub**.
2. Sign up at [vercel.com](https://vercel.com) and **Import** the repository.
3. On [developers.kite.trade](https://developers.kite.trade), add a redirect URL (keep localhost for local dev):

   ```
   https://YOUR-PROJECT.vercel.app/auth/kite/callback
   ```

   Replace with your real Vercel domain after the first deploy (or use the production URL from Vercel → Settings → Domains).

## Vercel environment variables

Set these in **Project → Settings → Environment Variables** (Production):

| Variable | Required | Example |
|----------|----------|---------|
| `KITE_API_KEY` | Yes | From Kite developer portal |
| `KITE_API_SECRET` | Yes | From Kite developer portal |
| `SESSION_SECRET` | Yes | 32+ random characters (e.g. `openssl rand -hex 32`) |
| `FRONTEND_URL` | Yes | `https://your-project.vercel.app` |
| `KITE_REDIRECT_URL` | Yes | `https://your-project.vercel.app/auth/kite/callback` |
| `NODE_ENV` | Yes | `production` |
| `COOKIE_SECURE` | Yes | `true` |
| `KITE_AUDIT_LOG` | Optional | `0` (recommended for shared beta) |
| `ANALYTICS_ADMIN_KEY` | Optional | Long random string for `/admin` |

Vercel sets `VERCEL=1` automatically; the app enables **stateless encrypted session cookies** so login works across serverless instances.

## Deploy

1. Connect the GitHub repo in Vercel (framework preset: **Other** — `vercel.json` controls build).
2. Add the env vars above.
3. Deploy. Copy the production URL.
4. Add the **exact** `KITE_REDIRECT_URL` in the Kite portal and redeploy if you changed `FRONTEND_URL`.

### CLI (optional)

```bash
npx vercel login
npx vercel link
npx vercel env add KITE_API_KEY
npx vercel env add KITE_API_SECRET
npx vercel env add SESSION_SECRET
npx vercel env add FRONTEND_URL
npx vercel env add KITE_REDIRECT_URL
npx vercel --prod
```

## Plans

| Plan | Notes |
|------|--------|
| **Hobby** | Free; API routes time out at **10s** — long-lived LTP stream may disconnect often |
| **Pro** | Recommended for friends; `maxDuration` 60s in `vercel.json` for smoother streaming |

## Always-on alternative

For 24/7 with fewer cold starts and persistent sessions on disk, use **Render** instead: see [DEPLOY-24-7.md](./DEPLOY-24-7.md) and `render.yaml`.

## Privacy

- Set `KITE_AUDIT_LOG=0` on Vercel so raw Kite payloads are not written to `/tmp`.
- Do not commit `.env` or share `KITE_API_SECRET` / `SESSION_SECRET`.
