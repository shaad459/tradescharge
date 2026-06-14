# Deploy Tradescharge on Render

Permanent link (no laptop). Example: `https://tradescharge.onrender.com`

## 1. Push code to GitHub

From `d:\Tradescharge` in PowerShell:

```powershell
git init
git add .
git commit -m "Prepare Render deploy"
```

Create a **private** repo on GitHub, then:

```powershell
git remote add origin https://github.com/YOUR_USER/tradescharge.git
git branch -M main
git push -u origin main
```

## 2. Create Render service

1. Go to [dashboard.render.com](https://dashboard.render.com) → sign up / log in.
2. **New +** → **Blueprint**.
3. Connect GitHub → select your `tradescharge` repo.
4. Render reads `render.yaml` automatically.
5. When prompted, enter:
   - **KITE_API_KEY** — from [developers.kite.trade](https://developers.kite.trade)
   - **KITE_API_SECRET** — same portal (never commit this)
   - **SESSION_SECRET** — click “Generate” (or paste 32+ random characters)
6. Click **Apply** and wait for the first deploy (~5–10 min).

## 3. Copy your live URL

After deploy succeeds, open the service → copy the URL, e.g.:

`https://tradescharge-xxxx.onrender.com`

Open it in a browser — you should see the Tradescharge landing page.

## 4. Kite redirect (required once)

On [developers.kite.trade](https://developers.kite.trade) → your app → **Redirect URL**, add:

```
https://tradescharge-xxxx.onrender.com/auth/kite/callback
```

Use your **exact** Render URL. Keep `http://127.0.0.1:8000/auth/kite/callback` for local dev if you still use it.

Save. No redeploy needed for Kite-only changes.

## 5. Test login

1. Open your Render URL.
2. **Login with Kite** (not “Try demo”).
3. You should land on the **live** dashboard with your positions.

Render sets `RENDER_EXTERNAL_URL` automatically — you usually **do not** need to set `FRONTEND_URL` or `KITE_REDIRECT_URL` in the dashboard.

## Plans

| Plan | Render setting | Good for |
|------|----------------|----------|
| **Free** | `plan: free` in `render.yaml` | Testing; sleeps after ~15 min idle |
| **Starter** | Change `plan: starter` in `render.yaml`, push, redeploy | Sharing with friends / always on (~$7/mo) |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails | Check Render logs; run `npm run build` locally |
| Login session expired | Kite redirect URL must match Render URL exactly (HTTPS) |
| Still shows demo | Log in with Kite on the **Render** URL, not localhost |
| Cold start slow | Free tier — first visit after idle wakes the service (~30–60s) |
| Redeploy logged everyone out | Normal on free/ephemeral disk — log in again |

## Share link

Send friends only:

`https://tradescharge-xxxx.onrender.com`

Each person uses their own Zerodha login. You do not see their password.
