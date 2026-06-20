import Decimal from "decimal.js";
import db from "./db.js";
import { newId } from "./ids.js";
import { priceMapUsd, fxRate } from "./prices.js";
import { portfolioValueUsd } from "./service.js";
import { getSetting } from "./settings.js";
import { broadcast } from "./sse.js";

const sym = (id: string) => ((db.prepare("SELECT symbol FROM assets WHERE id=?").get(id) as any)?.symbol ?? id);

interface Measured { value: Decimal; condition: boolean; label: string; }

function measure(a: any): Measured | null {
  const thr = new Decimal(a.threshold);
  const toCcy = (usd: Decimal) => (a.currency === "USD" ? usd : usd.mul(fxRate("USD", a.currency)));

  if (a.kind === "price_above" || a.kind === "price_below") {
    const p = priceMapUsd([a.asset_id])[a.asset_id];
    if (!p) return null;
    const val = toCcy(new Decimal(p.price));
    const cond = a.kind === "price_above" ? val.gte(thr) : val.lte(thr);
    return { value: val, condition: cond, label: `${sym(a.asset_id)} price ${a.kind === "price_above" ? "≥" : "≤"} ${thr} ${a.currency}` };
  }
  if (a.kind === "pct_change") {
    const p = priceMapUsd([a.asset_id])[a.asset_id];
    if (!p || p.change24h == null) return null;
    const ch = new Decimal(p.change24h);
    const cond = thr.isNegative() ? ch.lte(thr) : ch.gte(thr);
    return { value: ch, condition: cond, label: `${sym(a.asset_id)} 24h change ${thr.isNegative() ? "≤" : "≥"} ${thr}%` };
  }
  if (a.kind === "portfolio_value" && a.portfolio_id) {
    const val = toCcy(portfolioValueUsd(a.portfolio_id).value);
    return { value: val, condition: val.gte(thr), label: `Portfolio value ≥ ${thr} ${a.currency}` };
  }
  if (a.kind === "pnl" && a.portfolio_id) {
    const val = toCcy(portfolioValueUsd(a.portfolio_id).unrealized);
    const cond = thr.isNegative() ? val.lte(thr) : val.gte(thr);
    return { value: val, condition: cond, label: `Unrealized P/L ${thr.isNegative() ? "≤" : "≥"} ${thr} ${a.currency}` };
  }
  return null;
}

async function dispatch(orgId: string, channels: string[], message: string): Promise<{ channel: string; ok: boolean; note?: string }[]> {
  const out: { channel: string; ok: boolean; note?: string }[] = [{ channel: "inapp", ok: true }];
  for (const ch of channels) {
    if (ch === "inapp") continue;
    if (ch === "slack") {
      const url = getSetting(orgId, "slack_webhook");
      if (!url) { out.push({ channel: "slack", ok: false, note: "not configured" }); continue; }
      try {
        await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `🔔 CryptoTrack Biz — ${message}` }), signal: AbortSignal.timeout(8000) });
        out.push({ channel: "slack", ok: true });
      } catch { out.push({ channel: "slack", ok: false }); }
    } else if (ch.startsWith("webhook:")) {
      try {
        await fetch(ch.slice(8), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "alert", message }), signal: AbortSignal.timeout(8000) });
        out.push({ channel: "webhook", ok: true });
      } catch { out.push({ channel: "webhook", ok: false }); }
    } else if (ch.startsWith("email:")) {
      out.push({ channel: ch, ok: true, note: "queued (configure SMTP to deliver)" });
    }
  }
  return out;
}

export async function evaluateAlerts(): Promise<void> {
  const alerts = db.prepare("SELECT * FROM alerts WHERE enabled=1").all() as any[];
  for (const a of alerts) {
    try {
      const m = measure(a);
      if (!m) continue;
      const wasTrue = a.last_state === "1";
      db.prepare("UPDATE alerts SET last_state=? WHERE id=?").run(m.condition ? "1" : "0", a.id);
      if (!m.condition || wasTrue) continue; // edge-trigger: fire only on 0 → 1

      if (a.last_fired_at) {
        const mins = (Date.now() - new Date(a.last_fired_at.replace(" ", "T") + "Z").getTime()) / 60000;
        if (mins < a.cooldown_min) continue;
      }
      const channels = JSON.parse(a.channels || "[]");
      const message = `${m.label} — observed ${m.value.toDecimalPlaces(2)}`;
      const results = await dispatch(a.org_id, channels, message);
      const evId = newId();
      db.prepare("INSERT INTO alert_events (id, alert_id, org_id, observed, message, channels) VALUES (?,?,?,?,?,?)")
        .run(evId, a.id, a.org_id, m.value.toString(), message, JSON.stringify(results));
      db.prepare("UPDATE alerts SET last_fired_at=datetime('now') WHERE id=?").run(a.id);
      broadcast(a.org_id, "alert", { id: evId, alertId: a.id, message, observed: m.value.toString(), firedAt: new Date().toISOString() });
    } catch { /* per-rule isolation — never break the loop */ }
  }
}

/** Send a sample notification for an alert's channels (the "Test" button). */
export async function testAlert(orgId: string, channels: string[]): Promise<unknown> {
  return dispatch(orgId, channels, "Test alert from CryptoTrack Biz");
}
