import { Router } from "express";
import Decimal from "decimal.js";
import db from "../db.js";
import { requireAuth, requireRole } from "../context.js";
import { newId } from "../ids.js";
import { writeAudit } from "../audit.js";
import { testAlert } from "../alerts.js";
import { logInfo } from "../logbus.js";

const router = Router();
router.use(requireAuth);

const ASSET_KINDS = ["price_above", "price_below", "pct_change"];
const PORTFOLIO_KINDS = ["portfolio_value", "pnl"];
const ALL_KINDS = [...ASSET_KINDS, ...PORTFOLIO_KINDS];

router.get("/", (req, res) => {
  const ctx = (req as any).ctx;
  const rows = db.prepare(`
    SELECT al.*, a.symbol, p.name AS portfolio_name
    FROM alerts al LEFT JOIN assets a ON a.id=al.asset_id LEFT JOIN portfolios p ON p.id=al.portfolio_id
    WHERE al.org_id=? ORDER BY al.enabled DESC, al.created_at DESC`).all(ctx.orgId) as any[];
  res.json(rows.map((r) => ({
    id: r.id, kind: r.kind, threshold: r.threshold, currency: r.currency, window: r.window,
    channels: JSON.parse(r.channels || "[]"), cooldownMin: r.cooldown_min, enabled: !!r.enabled,
    assetId: r.asset_id, symbol: r.symbol, portfolioId: r.portfolio_id, portfolioName: r.portfolio_name,
    lastState: r.last_state, lastFiredAt: r.last_fired_at,
  })));
});

router.post("/", requireRole("analyst"), (req, res) => {
  const ctx = (req as any).ctx;
  const b = req.body ?? {};
  if (!ALL_KINDS.includes(b.kind)) return res.status(400).json({ error: "Invalid alert kind." });
  try { new Decimal(String(b.threshold)); } catch { return res.status(400).json({ error: "Threshold must be a number." }); }

  let assetId: string | null = null, portfolioId: string | null = null;
  if (ASSET_KINDS.includes(b.kind)) {
    const a = db.prepare("SELECT id FROM assets WHERE id=? OR symbol=? COLLATE NOCASE").get(String(b.assetId || "").toLowerCase(), b.assetId) as any;
    if (!a) return res.status(400).json({ error: "Pick a valid asset for this alert." });
    assetId = a.id;
  } else {
    const p = db.prepare("SELECT id FROM portfolios WHERE id=? AND org_id=?").get(b.portfolioId, ctx.orgId) as any;
    if (!p) return res.status(400).json({ error: "Pick a valid portfolio for this alert." });
    portfolioId = p.id;
  }
  const channels = Array.isArray(b.channels) && b.channels.length ? b.channels : ["inapp"];
  const id = newId();
  db.prepare(`INSERT INTO alerts (id, org_id, portfolio_id, asset_id, kind, threshold, window, currency, channels, cooldown_min, enabled, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, ctx.orgId, portfolioId, assetId, b.kind, String(b.threshold), b.window || "24h",
      (b.currency || "USD").toUpperCase(), JSON.stringify(channels), Number(b.cooldownMin) || 60, b.enabled === false ? 0 : 1, ctx.user.id);
  writeAudit({ orgId: ctx.orgId, actorId: ctx.user.id, actorName: ctx.user.name, actorRole: ctx.role, action: "alert.create", entity: "alert", entityId: id, detail: b.kind, ip: req.ip });
  logInfo("alerts", `New alert (${b.kind} @ ${b.threshold})`);
  res.json({ id });
});

router.patch("/:id", requireRole("analyst"), (req, res) => {
  const ctx = (req as any).ctx;
  const al = db.prepare("SELECT * FROM alerts WHERE id=? AND org_id=?").get(req.params.id, ctx.orgId) as any;
  if (!al) return res.status(404).json({ error: "Alert not found." });
  const b = req.body ?? {};
  const enabled = b.enabled == null ? al.enabled : b.enabled ? 1 : 0;
  const threshold = b.threshold != null ? String(b.threshold) : al.threshold;
  const channels = Array.isArray(b.channels) ? JSON.stringify(b.channels) : al.channels;
  const cooldown = b.cooldownMin != null ? Number(b.cooldownMin) : al.cooldown_min;
  // Re-arm when the user re-enables or edits the threshold
  const lastState = (b.enabled && !al.enabled) || (b.threshold != null) ? null : al.last_state;
  db.prepare("UPDATE alerts SET enabled=?, threshold=?, channels=?, cooldown_min=?, last_state=? WHERE id=?")
    .run(enabled, threshold, channels, cooldown, lastState, al.id);
  writeAudit({ orgId: ctx.orgId, actorId: ctx.user.id, actorName: ctx.user.name, actorRole: ctx.role, action: "alert.update", entity: "alert", entityId: al.id, ip: req.ip });
  res.json({ ok: true });
});

router.delete("/:id", requireRole("manager"), (req, res) => {
  const ctx = (req as any).ctx;
  const al = db.prepare("SELECT id FROM alerts WHERE id=? AND org_id=?").get(req.params.id, ctx.orgId) as any;
  if (!al) return res.status(404).json({ error: "Alert not found." });
  db.prepare("DELETE FROM alerts WHERE id=?").run(al.id);
  writeAudit({ orgId: ctx.orgId, actorId: ctx.user.id, actorName: ctx.user.name, actorRole: ctx.role, action: "alert.delete", entity: "alert", entityId: al.id, ip: req.ip });
  res.json({ ok: true });
});

router.post("/:id/test", requireRole("analyst"), async (req, res) => {
  const ctx = (req as any).ctx;
  const al = db.prepare("SELECT * FROM alerts WHERE id=? AND org_id=?").get(req.params.id, ctx.orgId) as any;
  if (!al) return res.status(404).json({ error: "Alert not found." });
  const results = await testAlert(ctx.orgId, JSON.parse(al.channels || "[]"));
  res.json({ results });
});

router.get("/events", (req, res) => {
  const ctx = (req as any).ctx;
  const rows = db.prepare(`
    SELECT e.*, al.kind, a.symbol FROM alert_events e
    JOIN alerts al ON al.id=e.alert_id LEFT JOIN assets a ON a.id=al.asset_id
    WHERE e.org_id=? ORDER BY e.fired_at DESC LIMIT 100`).all(ctx.orgId) as any[];
  res.json(rows.map((r) => ({
    id: r.id, alertId: r.alert_id, kind: r.kind, symbol: r.symbol, observed: r.observed,
    message: r.message, channels: r.channels ? JSON.parse(r.channels) : [], firedAt: r.fired_at, acknowledgedAt: r.acknowledged_at,
  })));
});

router.post("/events/:id/ack", requireRole("analyst"), (req, res) => {
  const ctx = (req as any).ctx;
  const ev = db.prepare("SELECT id FROM alert_events WHERE id=? AND org_id=?").get(req.params.id, ctx.orgId) as any;
  if (!ev) return res.status(404).json({ error: "Event not found." });
  db.prepare("UPDATE alert_events SET acknowledged_at=datetime('now') WHERE id=?").run(ev.id);
  res.json({ ok: true });
});

export default router;
