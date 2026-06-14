import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.VITE_API_PORT ?? "8000";
const devPort = Number(process.env.VITE_DEV_PORT ?? 5173);

/** Keep Set-Cookie from backend on redirects (needed for Kite OAuth via tunnel). */
function proxyWithCookies(target: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    secure: false,
    timeout: 120_000,
    proxyTimeout: 120_000,
    configure: (proxy) => {
      proxy.on("proxyRes", (proxyRes) => {
        const raw = proxyRes.headers["set-cookie"];
        if (!raw) {
          return;
        }
        proxyRes.headers["set-cookie"] = (Array.isArray(raw) ? raw : [raw]).map((line) =>
          line.replace(/;\s*Domain=[^;]*/gi, ""),
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "redirect-localhost-to-127",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const host = req.headers.host ?? "";
          if (host.startsWith("localhost:")) {
            const port = host.split(":")[1] ?? String(devPort);
            res.writeHead(302, { Location: `http://127.0.0.1:${port}${req.url ?? "/"}` });
            res.end();
            return;
          }
          next();
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: devPort,
    strictPort: true,
    allowedHosts: [".trycloudflare.com", "localhost"],
    proxy: {
      "/api": proxyWithCookies(`http://127.0.0.1:${apiPort}`),
      "/auth": proxyWithCookies(`http://127.0.0.1:${apiPort}`),
    },
  },
});
