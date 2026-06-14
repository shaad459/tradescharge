/** Public URL users open in the browser (OAuth redirects, CORS). */
export function getPublicAppUrl(): string {
  const explicit = process.env.FRONTEND_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const render = process.env.RENDER_EXTERNAL_URL?.trim();
  if (render) {
    return render.replace(/\/$/, "");
  }

  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) {
    return railway.startsWith("http") ? railway.replace(/\/$/, "") : `https://${railway}`;
  }

  const fly = process.env.FLY_APP_NAME?.trim();
  if (fly) {
    return `https://${fly}.fly.dev`;
  }

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) {
    return vercelProd.startsWith("http")
      ? vercelProd.replace(/\/$/, "")
      : `https://${vercelProd.replace(/\/$/, "")}`;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return vercel.startsWith("http")
      ? vercel.replace(/\/$/, "")
      : `https://${vercel.replace(/\/$/, "")}`;
  }

  const port = process.env.PORT ?? "8000";
  return `http://127.0.0.1:${port}`;
}

export function getKiteRedirectUrl(): string {
  const explicit = process.env.KITE_REDIRECT_URL?.trim();
  if (explicit) {
    return explicit;
  }
  return `${getPublicAppUrl()}/auth/kite/callback`;
}

export function shouldServeFrontend(): boolean {
  return (
    process.env.SERVE_FRONTEND === "1" ||
    process.env.SERVE_FRONTEND === "true" ||
    process.env.NODE_ENV === "production"
  );
}
