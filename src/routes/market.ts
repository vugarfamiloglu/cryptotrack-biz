import { Router } from "express";
import Decimal from "decimal.js";
import db from "../db.js";
import { requireAuth, requireRole } from "../context.js";
import { newId } from "../ids.js";
import { writeAudit } from "../audit.js";
import { valuatePortfolio, orgMethod } from "../service.js";
import { priceMapUsd, fxRate, lastAsOf, pollPrices } from "../prices.js";
import { logInfo } from "../logbus.js";

const router = Router();
router.use(requireAuth);

// --- Assets ----------------------------------------------------------------
router.get("/assets", (req, res) => {
  const rows = db.prepare("SELECT id, symbol, name, decimals, coingecko_id, is_active FROM assets ORDER BY symbol").all() as any[];
  const prices = priceMapUsd(rows.map((r) => r.id));
  res.json(rows.map((r) => ({
    id: r.id, symbol: r.symbol, name: r.name, decimals: r.decimals, isActive: !!r.is_active,
    priceUsd: prices[r.id]?.price ?? null, change24h: prices[r.id]?.change24h ?? null,
  })));
});

router.post("/assets", requireRole("manager"), async (req, res) => {
  const ctx = (req as any).ctx;
  const { id, symbol, name, decimals } = req.body ?? {};
  if (!id || !symbol || !name) return res.status(400).json({ error: "CoinGecko id, symbol and name are required." });
  const assetId = String(id).toLowerCase().trim();
  db.prepare("INSERT OR REPLACE INTO assets (id, symbol, name, decimals, coingecko_id, is_active) VALUES (?,?,?,?,?,1)")
    .run(assetId, String(symbol).toUpperCase().trim(), String(name).trim(), Number(decimals) || 8, assetId);
  writeAudit({ orgId: ctx.orgId, actorId: ctx.user.id, actorName: ctx.user.name, actorRole: ctx.role, action: "asset.add", entity: "asset", entityId: assetId, detail: symbol, ip: req.ip });
  logInfo("market", `Asset added: ${symbol} (${assetId})`);
  await pollPrices().catch(() => {});
  res.json({ id: assetId });
});

// --- Prices ----------------------------------------------------------------
router.get("/prices", (req, res) => {
  const rows = db.prepare("SELECT id, symbol, name FROM assets WHERE is_active=1").all() as any[];
  const prices = priceMapUsd(rows.map((r) => r.id));
  res.json({
    asOf: lastAsOf(),
    prices: rows.filter((r) => prices[r.id]).map((r) => ({
      assetId: r.id, symbol: r.symbol, name: r.name,
      priceUsd: prices[r.id].price, change24h: prices[r.id].change24h ?? null, source: prices[r.id].source,
    })),
  });
});

router.get("/prices/history/:assetId", (req, res) => {
  const rows = db.prepare(`SELECT price, change_24h, as_of FROM price_snapshots
    WHERE asset_id=? AND vs='USD' ORDER BY as_of DESC LIMIT 200`).all(req.params.assetId) as any[];
  res.json(rows.reverse().map((r) => ({ price: r.price, change24h: r.change_24h, asOf: r.as_of })));
});

// --- Dashboard aggregation -------------------------------------------------
router.get("/dashboard", (req, res) => {
  const ctx = (req as any).ctx;
  const org = db.prepare("SELECT base_currency FROM organizations WHERE id=?").get(ctx.orgId) as any;
  const baseCcy = org?.base_currency || "USD";
  const method = orgMethod(ctx.orgId);
  const portfolios = db.prepare("SELECT * FROM portfolios WHERE org_id=? AND archived_at IS NULL ORDER BY name").all(ctx.orgId) as any[];

  let mv = new Decimal(0), cost = new Decimal(0), upl = new Decimal(0), rpl = new Decimal(0);
  const byAsset = new Map<string, { symbol: string; name: string; mv: Decimal; change24h: number | null }>();
  const perPortfolio = portfolios.map((p) => {
    const v = valuatePortfolio(p.id, method, baseCcy);
    mv = mv.add(v.totals.marketValue); cost = cost.add(v.totals.costBasis);
    upl = upl.add(v.totals.unrealizedPnL); rpl = rpl.add(v.totals.realizedPnL);
    for (const pos of v.positions) {
      if (new Decimal(pos.qty).lte(0)) continue;
      const cur = byAsset.get(pos.assetId) ?? { symbol: pos.symbol, name: pos.name, mv: new Decimal(0), change24h: pos.change24hPct ?? null };
      cur.mv = cur.mv.add(pos.marketValue);
      byAsset.set(pos.assetId, cur);
    }
    return { id: p.id, name: p.name, marketValue: v.totals.marketValue, unrealizedPnL: v.totals.unrealizedPnL, unrealizedPct: v.totals.unrealizedPct };
  });

  const allocation = [...byAsset.entries()].map(([assetId, a]) => ({
    assetId, symbol: a.symbol, name: a.name, marketValue: a.mv.toString(),
    allocationPct: mv.gt(0) ? a.mv.div(mv).mul(100).toDecimalPlaces(2).toString() : "0", change24h: a.change24h,
  })).sort((x, y) => Number(y.marketValue) - Number(x.marketValue));

  const movers = [...byAsset.values()].filter((a) => a.change24h != null)
    .map((a) => ({ symbol: a.symbol, name: a.name, change24h: a.change24h }))
    .sort((x, y) => Math.abs(y.change24h!) - Math.abs(x.change24h!)).slice(0, 6);

  const recentAlerts = db.prepare(`SELECT e.id, e.message, e.observed, e.fired_at, e.acknowledged_at, al.kind
    FROM alert_events e JOIN alerts al ON al.id=e.alert_id WHERE e.org_id=? ORDER BY e.fired_at DESC LIMIT 6`).all(ctx.orgId) as any[];

  res.json({
    baseCurrency: baseCcy, method, asOf: lastAsOf(),
    totals: { marketValue: mv.toString(), costBasis: cost.toString(), unrealizedPnL: upl.toString(),
      unrealizedPct: cost.gt(0) ? upl.div(cost).mul(100).toDecimalPlaces(2).toString() : "0", realizedPnL: rpl.toString() },
    portfolios: perPortfolio, allocation, movers,
    recentAlerts: recentAlerts.map((r) => ({ id: r.id, kind: r.kind, message: r.message, observed: r.observed, firedAt: r.fired_at, acknowledgedAt: r.acknowledged_at })),
    counts: {
      portfolios: portfolios.length,
      transactions: (db.prepare("SELECT COUNT(*) c FROM transactions WHERE org_id=?").get(ctx.orgId) as any).c,
      alerts: (db.prepare("SELECT COUNT(*) c FROM alerts WHERE org_id=? AND enabled=1").get(ctx.orgId) as any).c,
    },
  });
});

export default router;
