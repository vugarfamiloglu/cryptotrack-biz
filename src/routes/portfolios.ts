import { Router } from "express";
import Decimal from "decimal.js";
import db from "../db.js";
import { requireAuth, requireRole } from "../context.js";
import { newId } from "../ids.js";
import { writeAudit } from "../audit.js";
import { valuatePortfolio, orgMethod } from "../service.js";
import { portfolioCsv, portfolioPdf } from "../reports.js";
import { logInfo } from "../logbus.js";
import type { CostMethod } from "../engine/valuation.js";

const router = Router();
router.use(requireAuth);

const VALID_METHODS = ["FIFO", "LIFO", "HIFO", "AVG"];
function pick(req: any): { method: CostMethod; currency: string } {
  const ctx = req.ctx;
  const method = VALID_METHODS.includes(req.query.method) ? req.query.method : orgMethod(ctx.orgId);
  const currency = typeof req.query.currency === "string" && req.query.currency ? req.query.currency.toUpperCase() : undefined;
  return { method, currency: currency ?? "" };
}
function ownedPortfolio(orgId: string, id: string) {
  return db.prepare("SELECT * FROM portfolios WHERE id=? AND org_id=?").get(id, orgId) as any;
}

// List portfolios with valuation summary
router.get("/", (req, res) => {
  const ctx = (req as any).ctx;
  const { method } = pick(req);
  const rows = db.prepare("SELECT * FROM portfolios WHERE org_id=? ORDER BY archived_at IS NOT NULL, name").all(ctx.orgId) as any[];
  const list = rows.map((p) => {
    const v = valuatePortfolio(p.id, method, p.base_currency || "USD");
    return {
      id: p.id, name: p.name, description: p.description, baseCurrency: p.base_currency,
      archivedAt: p.archived_at, positionsCount: v.positions.filter((x: any) => Number(x.qty) > 0).length,
      marketValue: v.totals.marketValue, costBasis: v.totals.costBasis,
      unrealizedPnL: v.totals.unrealizedPnL, unrealizedPct: v.totals.unrealizedPct, realizedPnL: v.totals.realizedPnL,
    };
  });
  res.json(list);
});

router.post("/", requireRole("manager"), (req, res) => {
  const ctx = (req as any).ctx;
  const { name, description, baseCurrency } = req.body ?? {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Name is required." });
  const id = newId();
  const orgCcy = (db.prepare("SELECT base_currency FROM organizations WHERE id=?").get(ctx.orgId) as any)?.base_currency || "USD";
  db.prepare("INSERT INTO portfolios (id, org_id, name, description, base_currency) VALUES (?,?,?,?,?)")
    .run(id, ctx.orgId, String(name).trim(), description ?? "", (baseCurrency || orgCcy).toUpperCase());
  writeAudit({ orgId: ctx.orgId, actorId: ctx.user.id, actorName: ctx.user.name, actorRole: ctx.role, action: "portfolio.create", entity: "portfolio", entityId: id, detail: name, ip: req.ip });
  logInfo("portfolio", `Created portfolio "${name}"`);
  res.json({ id });
});

router.get("/:id", (req, res) => {
  const ctx = (req as any).ctx;
  const p = ownedPortfolio(ctx.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: "Portfolio not found." });
  const { method, currency } = pick(req);
  const v = valuatePortfolio(p.id, method, currency || p.base_currency || "USD");
  res.json({ portfolio: { id: p.id, name: p.name, description: p.description, baseCurrency: p.base_currency, archivedAt: p.archived_at }, method, ...v });
});

router.patch("/:id", requireRole("manager"), (req, res) => {
  const ctx = (req as any).ctx;
  const p = ownedPortfolio(ctx.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: "Portfolio not found." });
  const { name, description, archived } = req.body ?? {};
  db.prepare("UPDATE portfolios SET name=?, description=?, archived_at=? WHERE id=?")
    .run(name?.trim() || p.name, description ?? p.description, archived ? (p.archived_at || new Date().toISOString()) : null, p.id);
  writeAudit({ orgId: ctx.orgId, actorId: ctx.user.id, actorName: ctx.user.name, actorRole: ctx.role, action: "portfolio.update", entity: "portfolio", entityId: p.id, ip: req.ip });
  res.json({ ok: true });
});

// Reports
router.get("/:id/report.csv", (req, res) => {
  const ctx = (req as any).ctx;
  const p = ownedPortfolio(ctx.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: "Portfolio not found." });
  const { method, currency } = pick(req);
  const csv = portfolioCsv({ portfolioId: p.id, method, currency: currency || p.base_currency });
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="${p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-holdings.csv"`);
  res.send(csv);
});

router.get("/:id/report.pdf", async (req, res) => {
  const ctx = (req as any).ctx;
  const p = ownedPortfolio(ctx.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: "Portfolio not found." });
  const { method, currency } = pick(req);
  const buf = await portfolioPdf({ portfolioId: p.id, method, currency: currency || p.base_currency });
  res.setHeader("content-type", "application/pdf");
  res.setHeader("content-disposition", `attachment; filename="${p.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-statement.pdf"`);
  res.send(buf);
});

export default router;
export { ownedPortfolio };
