# Cloudflare tunnel for Tradescharge

## Can `sacred-award-known-survivor.trycloudflare.com` stay the same after reboot?

**No.** That hostname was from a [Quick Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) (`cloudflared tunnel --url …`). Cloudflare generates a **random** subdomain each time the process starts. You cannot reserve or reuse a specific `*.trycloudflare.com` name.

After a laptop restart you only get that exact URL again if the tunnel never stopped and Cloudflare still has it allocated — **do not rely on that** for Rainmatter or any long-lived demo link.

| Approach | URL after reboot | Laptop required | SSE (live prices) |
|----------|------------------|-----------------|-------------------|
| Quick tunnel | **New** random URL | Yes | **Not supported** on quick tunnels |
| **Named tunnel** + your domain on Cloudflare | **Same** (e.g. `tradescharge.yourdomain.com`) | Yes | Supported |
| **Render** (see [DEPLOY-24-7.md](./DEPLOY-24-7.md)) | **Same** `*.onrender.com` | No | Supported |

**Recommendation:** Use Render for investor/demo links. Use a named tunnel only if you must host from your PC with a fixed hostname.

---

## Quick tunnel (testing only)

```powershell
npm run tunnel
```

This builds the app, runs production on port **8000** (single origin — better than Vite dev for OAuth), starts `cloudflared`, and updates `.env` with the new URL when it changes.

You must add the new redirect URL in [Kite developer portal](https://developers.kite.trade) every time the subdomain changes.

---

## Named tunnel (stable URL from your laptop)

Requires:

1. A domain on Cloudflare (free plan is fine).
2. `cloudflared` installed (`winget install Cloudflare.cloudflared`).

### One-time setup

```powershell
cd d:\Tradescharge
powershell -ExecutionPolicy Bypass -File scripts\setup-named-tunnel.ps1
```

Follow prompts: login, tunnel name, hostname (e.g. `tradescharge.yourdomain.com`). The script writes `config.yml` under `%USERPROFILE%\.cloudflared\`.

Add in Kite portal (once):

```
https://tradescharge.yourdomain.com/auth/kite/callback
```

Set in `.env`:

```
FRONTEND_URL=https://tradescharge.yourdomain.com
KITE_REDIRECT_URL=https://tradescharge.yourdomain.com/auth/kite/callback
```

### Start after every reboot

```powershell
npm run tunnel:named
```

Optional — start on Windows login:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-tunnel-startup.ps1
```

---

## Why production on port 8000 (not `npm run dev`)?

- One public URL → backend serves `frontend/dist` (`SERVE_FRONTEND=true`).
- Quick tunnels [do not support Server-Sent Events](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/); live LTP needs a named tunnel or Render.
