import Decimal from "decimal.js";
import db from "./db.js";
import { getSetting } from "./settings.js";
import type { PriceMap } from "./engine/valuation.js";

interface Cached { price: string; change24h: number | null; marketCap: number | null; source: string; asOf: string; }
const cache = new Map<string, Cached>(); // assetId (USD)

export function heldAssetIds(): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT asset_id FROM transactions
    UNION SELECT DISTINCT asset_id FROM alerts WHERE asset_id IS NOT NULL
  `).all() as { asset_id: string }[];
  return rows.map((r) => r.asset_id);
}

async function fetchCoinGecko(ids: string[]): Promise<Record<string, Omit<Cached, "source" | "asOf">>> {
  if (!ids.length) return {};
  const key = getSetting("", "coingecko_api_key", "COINGECKO_API_KEY");
  const headers: Record<string, string> = { accept: "application/json" };
  if (key) headers["x-cg-demo-api-key"] = key;
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const j: any = await res.json();
  const out: Record<string, any> = {};
  for (const id of ids) {
    const d = j[id];
    if (d && d.usd != null) out[id] = { price: String(d.usd), change24h: d.usd_24h_change ?? null, marketCap: d.usd_market_cap ?? null };
  }
  return out;
}

const insSnap = db.prepare("INSERT OR REPLACE INTO price_snapshots (asset_id, vs, price, change_24h, market_cap, source, as_of) VALUES (?,?,?,?,?,?,?)");

/** Poll prices for all held assets → cache + snapshots. Returns count fetched. */
export async function pollPrices(): Promise<number> {
  const ids = heldAssetIds();
  if (!ids.length) return 0;
  let data: Record<string, any> = {};
  try { data = await fetchCoinGecko(ids); } catch { data = {}; } // degrade to last-good
  const asOf = new Date().toISOString();
  let n = 0;
  for (const id of ids) {
    const d = data[id];
    if (!d) continue;
    cache.set(id, { ...d, source: "coingecko", asOf });
    insSnap.run(id, "USD", d.price, d.change24h, d.marketCap, "coingecko", asOf);
    n++;
  }
  return n;
}

const latestSnap = db.prepare("SELECT price, change_24h, as_of FROM price_snapshots WHERE asset_id=? AND vs='USD' ORDER BY as_of DESC LIMIT 1");

/** Price map in USD for the valuation engine (cache → snapshot fallback). */
export function priceMapUsd(assetIds: string[]): PriceMap {
  const out: PriceMap = {};
  for (const id of assetIds) {
    let c = cache.get(id);
    if (!c) {
      const s = latestSnap.get(id) as any;
      if (s) c = { price: s.price, change24h: s.change_24h, marketCap: null, source: "snapshot", asOf: s.as_of };
    }
    if (c) out[id] = { price: c.price, change24h: c.change24h, source: c.source };
  }
  return out;
}

export function lastAsOf(): string | null {
  let latest: string | null = null;
  for (const c of cache.values()) if (!latest || c.asOf > latest) latest = c.asOf;
  return latest;
}

// --- FX (keyless open.er-api.com) ------------------------------------------
const insFx = db.prepare("INSERT OR REPLACE INTO fx_rates (base, quote, rate, as_of) VALUES (?,?,?,?)");
export async function pollFx(base = "USD"): Promise<void> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, { signal: AbortSignal.timeout(10000) });
    const j: any = await res.json();
    if (j?.rates) {
      const asOf = new Date().toISOString();
      for (const [q, r] of Object.entries(j.rates)) insFx.run(base, q, String(r), asOf);
    }
  } catch { /* keep last-good FX */ }
}
const fxRow = db.prepare("SELECT rate FROM fx_rates WHERE base=? AND quote=?");
export function fxRate(from: string, to: string): Decimal {
  if (from === to) return new Decimal(1);
  const r = fxRow.get(from, to) as any;
  if (r) return new Decimal(r.rate);
  const inv = fxRow.get(to, from) as any;
  if (inv) return new Decimal(1).div(inv.rate);
  return new Decimal(1);
}
