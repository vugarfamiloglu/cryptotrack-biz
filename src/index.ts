import express from "express";
import cron from "node-cron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

import "./db.js";
import authRoutes from "./routes/auth.js";
import portfolioRoutes from "./routes/portfolios.js";
import txRoutes from "./routes/transactions.js";
import alertRoutes from "./routes/alerts.js";
import marketRoutes from "./routes/market.js";
import adminRoutes from "./routes/admin.js";
import { pollPrices, pollFx, priceMapUsd, lastAsOf, heldAssetIds } from "./prices.js";
import { evaluateAlerts } from "./alerts.js";
import { broadcastAll } from "./sse.js";
import { logInfo, logWarn, logOk, logError } from "./logbus.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 6800;
const POLL_SECONDS = Math.max(15, Number(process.env.PRICE_POLL_SECONDS) || 60);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, asOf: lastAsOf() }));
app.use("/api/auth", authRoutes);
app.use("/api/portfolios", portfolioRoutes);
app.use("/api/transactions", txRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api", marketRoutes); // /api/assets, /api/prices, /api/dashboard
app.use("/api", adminRoutes); // /api/settings, /api/audit, /api/logs, /api/stream

// Static SPA (built into web/dist)
const dist = path.join(__dirname, "..", "web", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  app.get("/", (_req, res) => res.type("text").send("CryptoTrack Biz API is running. Build the web client with: npm run build:web"));
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logError("http", err?.message ?? String(err));
  res.status(500).json({ error: "Internal error." });
});

// --- Background worker ------------------------------------------------------
let ticking = false;
async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const n = await pollPrices();
    if (n > 0) {
      logOk("prices", `Refreshed ${n} asset price(s) · ${new Date().toLocaleTimeString()}`);
      const ids = heldAssetIds();
      const prices = priceMapUsd(ids);
      broadcastAll("prices", { asOf: lastAsOf(), prices });
    } else {
      logWarn("prices", "No prices fetched (using last-good values)");
    }
    await evaluateAlerts();
  } catch (e: any) {
    logError("worker", e?.message ?? String(e));
  } finally {
    ticking = false;
  }
}

app.listen(PORT, async () => {
  logInfo("boot", `CryptoTrack Biz listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`CryptoTrack Biz → http://localhost:${PORT}`);
  await pollFx("USD").catch(() => {});
  await tick();
  setInterval(tick, POLL_SECONDS * 1000);
  cron.schedule("0 6 * * *", () => { pollFx("USD").then(() => logInfo("fx", "Daily FX rates refreshed")).catch(() => {}); });
});
