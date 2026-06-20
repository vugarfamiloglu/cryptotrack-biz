import { Router } from "express";
import db from "../db.js";
import { requireAuth, requireRole } from "../context.js";
import { writeAudit } from "../audit.js";
import { getSetting, setSetting, publicSettings, SECRET_KEYS } from "../settings.js";
import { recentLogs } from "../logbus.js";
import { addClient } from "../sse.js";
import { lastAsOf } from "../prices.js";

const router = Router();

// --- Settings --------------------------------------------------------------
router.get("/settings", requireAuth, requireRole("manager"), (req, res) => {
  const ctx = (req as any).ctx;
  res.json(publicSettings(ctx.orgId));
});

const VALID_METHODS = ["FIFO", "LIFO", "HIFO", "AVG"];
router.put("/settings", requireAuth, requireRole("manager"), (req, res) => {
  const ctx = (req as any).ctx;
  const b = req.body ?? {};
  if (b.org) {
    const method = VALID_METHODS.includes(b.org.costBasisMethod) ? b.org.costBasisMethod : undefined;
    if (b.org.name || b.org.baseCurrency || method) {
      const cur = db.prepare("SELECT name, base_currency, cost_basis_method FROM organizations WHERE id=?").get(ctx.orgId) as any;
      db.prepare("UPDATE organizations SET name=?, base_currency=?, cost_basis_method=? WHERE id=?").run(
        b.org.name?.trim() || cur.name, (b.org.baseCurrency || cur.base_currency).toUpperCase(),
        method || cur.cost_basis_method, ctx.orgId);
    }
  }
  // Secret + plain settings (only persist secrets when a non-masked value is supplied)
  for (const key of [...SECRET_KEYS, "price_provider", "poll_seconds"]) {
    if (key in (b.settings ?? {})) {
      const val = b.settings[key];
      if (SECRET_KEYS.includes(key) && (val === "" || val === "********")) continue;
      setSetting(ctx.orgId, key, String(val));
    }
  }
  writeAudit({ orgId: ctx.orgId, actorId: ctx.user.id, actorName: ctx.user.name, actorRole: ctx.role, action: "settings.update", entity: "org", entityId: ctx.orgId, ip: req.ip });
  res.json(publicSettings(ctx.orgId));
});

// --- Audit log -------------------------------------------------------------
router.get("/audit", requireAuth, requireRole("manager"), (req, res) => {
  const ctx = (req as any).ctx;
  const rows = db.prepare(`SELECT id, actor_name, actor_role, action, entity, entity_id, detail, ip, created_at
    FROM audit_logs WHERE org_id=? ORDER BY created_at DESC LIMIT 250`).all(ctx.orgId) as any[];
  res.json(rows.map((r) => ({
    id: r.id, actor: r.actor_name, role: r.actor_role, action: r.action, entity: r.entity,
    entityId: r.entity_id, detail: r.detail, ip: r.ip, at: r.created_at,
  })));
});

// --- Log monitor -----------------------------------------------------------
router.get("/logs", requireAuth, (req, res) => {
  res.json(recentLogs(250));
});

// --- SSE stream ------------------------------------------------------------
router.get("/stream", requireAuth, (req, res) => {
  const ctx = (req as any).ctx;
  res.set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify({ asOf: lastAsOf() })}\n\n`);
  const heartbeat = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* gone */ } }, 25000);
  const off = addClient(ctx.orgId, res);
  req.on("close", () => { clearInterval(heartbeat); off(); });
});

export default router;
