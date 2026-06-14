# Deploy to tradescharge.com (Render)

## 1. GitHub (done locally — push after `gh auth login`)

Repo should be at `https://github.com/YOUR_USER/tradescharge` (private).

## 2. Render Blueprint

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Blueprint**
2. Connect GitHub → select `tradescharge` repo
3. Set secrets when prompted:
   - `KITE_API_KEY`
   - `KITE_API_SECRET`
   - `SESSION_SECRET` (Generate)
4. Apply → wait for first deploy (~5–10 min)
5. Copy service URL: `https://tradescharge-xxxx.onrender.com`

## 3. Custom domain tradescharge.com

1. Render service → **Settings** → **Custom Domains**
2. Add `tradescharge.com` and `www.tradescharge.com`
3. At your DNS host (Cloudflare / registrar), add the records Render shows
4. Wait for SSL (usually a few minutes)

## 4. Environment variables (Render → Environment)

| Variable | Value |
|----------|--------|
| `FRONTEND_URL` | `https://tradescharge.com` |
| `KITE_REDIRECT_URL` | `https://tradescharge.com/auth/kite/callback` |

**Manual Deploy** after saving.

Optional for always-on: edit `render.yaml` → `plan: starter` → push → redeploy.

## 5. Kite developer portal

[developers.kite.trade](https://developers.kite.trade) → your app → Redirect URL:

```
https://tradescharge.com/auth/kite/callback
```

Keep localhost URLs for local dev if needed.

## 6. Test

Open `https://tradescharge.com` → **Login with Kite** → live dashboard.
