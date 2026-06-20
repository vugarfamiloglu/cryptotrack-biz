import { Router } from "express";
import Decimal from "decimal.js";
import db from "../db.js";
import { requireAuth, requireRole } from "../context.js";
import { newId } from "../ids.js";
import { writeAudit } from "../audit.js";
import { logInfo, logWarn } from "../logbus.js";
import { ownedPortfolio } from "./portfolios.js";

const router = Router();
router.use(requireAuth);

const TX_TYPES = ["buy", "sell", "transfer_in", "transfer_out", "airdrop", "reward", "fee"];

function resolveAsset(orgKeyOrSymbol: string): any {
  const k = String(orgKeyOrSymbol || "").trim();
  if (!k) return null;
  return (db.prepare("SELECT * FROM assets WHERE id=?").get(k.toLowerCase()) ??
    db.prepare("SELECT * FROM assets WHERE symbol=? COLLATE NOCASE").get(k)) as any;
}

function isPosDecimal(v: unknown, allowZero = false): boolean {
  try {
    const d = new Decimal(String(v));
    return d.isFinite() && (allowZero ? d.gte(0) : d.gt(0));
  } catch { return false; }
}

// Org-wide ledger (most recent first), optional ?portfolio= & ?asset= filters
router.get("/", (req, res) => {
  const ctx = (req as any).ctx;
  const conds = ["t.org_id=?"]; const params: any[] = [ctx.orgId];
  if (req.query.portfolio) { conds.push("t.portfolio_id=?"); params.push(req.query.portfolio); }
  if (req.query.asset) { conds.push("t.asset_id=?"); params.push(String(req.query.asset).toLowerCase()); }
  const rows = db.prepare(`
    SELECT t.*, a.symbol, a.name AS asset_name, p.name AS portfolio_name, u.name AS author
    FROM transactions t JOIN assets a ON a.id=t.asset_id JOIN portfolios p ON p.id=t.portfolio_id LEFT JOIN users u ON u.id=t.created_by
    WHERE ${conds.join(" AND ")} ORDER BY t.executed_at DESC, t.created_at DESC LIMIT 500`).all(...params) as any[];
  res.json(rows.map((r) => ({
    id: r.id, type: r.type, assetId: r.asset_id, symbol: r.symbol, assetName: r.asset_name,
    portfolioId: r.portfolio_id, portfolioName: r.portfolio_name, quantity: r.quantity, unitPrice: r.unit_price,
    currency: r.currency, fee: r.fee, executedAt: r.executed_at, note: r.note, reversesId: r.reverses_id, author: r.author,
  })));
});

// List a portfolio's transactions
router.get("/portfolio/:id", (req, res) => {
  const ctx = (req as any).ctx;
  const p = ownedPortfolio(ctx.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: "Portfolio not found." });
  const rows = db.prepare(`
    SELECT t.*, a.symbol, a.name AS asset_name, u.name AS author
    FROM transactions t JOIN assets a ON a.id=t.asset_id LEFT JOIN users u ON u.id=t.created_by
    WHERE t.portfolio_id=? ORDER BY t.executed_at DESC, t.created_at DESC`).all(p.id) as any[];
  res.json(rows.map((r) => ({
    id: r.id, type: r.type, assetId: r.asset_id, symbol: r.symbol, assetName: r.asset_name,
    quantity: r.quantity, unitPrice: r.unit_price, currency: r.currency, fee: r.fee,
    executedAt: r.executed_at, note: r.note, externalRef: r.external_ref, reversesId: r.reverses_id, author: r.author,
  })));
});

router.post("/", requireRole("analyst"), (req, res) => {
  const ctx = (req as any).ctx;
  const b = req.body ?? {};
  const p = ownedPortfolio(ctx.orgId, b.portfolioId);
  if (!p) return res.status(404).json({ error: "Portfolio not found." });
  if (!TX_TYPES.includes(b.type)) return res.status(400).json({ error: "Invalid transaction type." });
  const asset = resolveAsset(b.assetId);
  if (!asset) return res.status(400).json({ error: "Unknown asset. Add it under Assets first." });
  if (!isPosDecimal(b.quantity)) return res.status(400).json({ error: "Quantity must be a positive number." });
  if (!isPosDecimal(b.unitPrice, true)) return res.status(400).json({ error: "Unit price must be zero or positive." });
  if (b.fee != null && b.fee !== "" && !isPosDecimal(b.fee, true)) return res.status(400).json({ error: "Fee must be zero or positive." });

  const id = newId();
  const executedAt = b.executedAt ? new Date(b.executedAt).toISOString() : new Date().toISOString();
  db.prepare(`INSERT INTO transactions (id, org_id, portfolio_id, asset_id, type, quantity, unit_price, currency, fee, executed_at, external_ref, note, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, ctx.orgId, p.id, asset.id, b.type, String(b.quantity), String(b.unitPrice || "0"),
      (b.currency || p.base_currency || "USD").toUpperCase(), String(b.fee || "0"), executedAt, b.externalRef ?? null, b.note ?? null, ctx.user.id);
  writeAudit({ orgId: ctx.orgId, actorId: ctx.user.id, actorName: ctx.user.name, actorRole: ctx.role, action: "tx.create", entity: "transaction", entityId: id, detail: `${b.type} ${b.quantity} ${asset.symbol}`, ip: req.ip });
  logInfo("ledger", `${ctx.user.name}: ${b.type} ${b.quantity} ${asset.symbol} @ ${b.unitPrice}`);
  res.json({ id });
});

// Reverse (correct) a transaction with an immutable opposite entry
router.post("/:id/reverse", requireRole("analyst"), (req, res) => {
  const ctx = (req as any).ctx;
  const orig = db.prepare("SELECT * FROM transactions WHERE id=? AND org_id=?").get(req.params.id, ctx.orgId) as any;
  if (!orig) return res.status(404).json({ error: "Transaction not found." });
  if (orig.reverses_id) return res.status(400).json({ error: "A reversing entry cannot itself be reversed." });
  const already = db.prepare("SELECT id FROM transactions WHERE reverses_id=?").get(orig.id);
  if (already) return res.status(400).json({ error: "This transaction has already been reversed." });

  const opposite: Record<string, string> = { buy: "sell", sell: "buy", transfer_in: "transfer_out", transfer_out: "transfer_in", airdrop: "transfer_out", reward: "transfer_out", fee: "transfer_in" };
  const id = newId();
  db.prepare(`INSERT INTO transactions (id, org_id, portfolio_id, asset_id, type, quantity, unit_price, currency, fee, executed_at, note, reverses_id, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, orig.org_id, orig.portfolio_id, orig.asset_id, opposite[orig.type] ?? "transfer_out", orig.quantity, orig.unit_price,
      orig.currency, "0", new Date().toISOString(), `Reversal of ${orig.id}`, orig.id, ctx.user.id);
  writeAudit({ orgId: ctx.orgId, actorId: ctx.user.id, actorName: ctx.user.name, actorRole: ctx.role, action: "tx.reverse", entity: "transaction", entityId: id, detail: orig.id, ip: req.ip });
  logWarn("ledger", `${ctx.user.name} reversed transaction ${orig.id}`);
  res.json({ id });
});

// --- CSV import ------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

router.post("/portfolio/:id/import", requireRole("analyst"), (req, res) => {
  const ctx = (req as any).ctx;
  const p = ownedPortfolio(ctx.orgId, req.params.id);
  if (!p) return res.status(404).json({ error: "Portfolio not found." });
  const text = String(req.body?.csv ?? "");
  if (!text.trim()) return res.status(400).json({ error: "CSV body is empty." });

  const rows = parseCsv(text);
  if (!rows.length) return res.status(400).json({ error: "No rows found." });
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;
  const col = { date: idx(["date", "executed_at", "time"]), type: idx(["type", "side"]), asset: idx(["asset", "symbol", "coin", "ticker"]), qty: idx(["quantity", "qty", "amount"]), price: idx(["unit_price", "price", "unitprice"]), ccy: idx(["currency", "ccy"]), fee: idx(["fee", "fees"]), note: idx(["note", "memo"]) };
  if (col.type < 0 || col.asset < 0 || col.qty < 0) return res.status(400).json({ error: "CSV must include type, asset and quantity columns." });

  const ins = db.prepare(`INSERT INTO transactions (id, org_id, portfolio_id, asset_id, type, quantity, unit_price, currency, fee, executed_at, note, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  let imported = 0; const errors: string[] = [];
  const tx = db.transaction(() => {
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const type = (cells[col.type] || "").trim().toLowerCase();
      const asset = resolveAsset(cells[col.asset]);
      const qty = cells[col.qty];
      if (!TX_TYPES.includes(type)) { errors.push(`Row ${r + 1}: bad type "${type}"`); continue; }
      if (!asset) { errors.push(`Row ${r + 1}: unknown asset "${cells[col.asset]}"`); continue; }
      if (!isPosDecimal(qty)) { errors.push(`Row ${r + 1}: bad quantity "${qty}"`); continue; }
      const price = col.price >= 0 && isPosDecimal(cells[col.price], true) ? cells[col.price] : "0";
      const fee = col.fee >= 0 && isPosDecimal(cells[col.fee], true) ? cells[col.fee] : "0";
      const when = col.date >= 0 && cells[col.date] ? new Date(cells[col.date]) : new Date();
      ins.run(newId(), ctx.orgId, p.id, asset.id, type, String(qty), String(price),
        (col.ccy >= 0 && cells[col.ccy] ? cells[col.ccy] : p.base_currency || "USD").toUpperCase(),
        String(fee), isNaN(when.getTime()) ? new Date().toISOString() : when.toISOString(),
        col.note >= 0 ? cells[col.note] : "CSV import", ctx.user.id);
      imported++;
    }
  });
  tx();
  writeAudit({ orgId: ctx.orgId, actorId: ctx.user.id, actorName: ctx.user.name, actorRole: ctx.role, action: "tx.import", entity: "portfolio", entityId: p.id, detail: `${imported} rows`, ip: req.ip });
  logInfo("ledger", `CSV import into "${p.name}": ${imported} added, ${errors.length} skipped`);
  res.json({ imported, skipped: errors.length, errors: errors.slice(0, 25) });
});

export default router;
