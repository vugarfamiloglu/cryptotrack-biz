import Decimal from "decimal.js";
import db from "./db.js";
import { valuate, type Tx, type CostMethod, type ValuationResult } from "./engine/valuation.js";
import { priceMapUsd, fxRate } from "./prices.js";

export function orgMethod(orgId: string): CostMethod {
  const o = db.prepare("SELECT cost_basis_method FROM organizations WHERE id=?").get(orgId) as any;
  return (o?.cost_basis_method ?? "FIFO") as CostMethod;
}

export function portfolioTxs(portfolioId: string): Tx[] {
  const rows = db.prepare(`SELECT asset_id, type, quantity, unit_price, currency, fee, executed_at
    FROM transactions WHERE portfolio_id=? ORDER BY executed_at`).all(portfolioId) as any[];
  return rows.map((r) => ({
    assetId: r.asset_id, type: r.type, quantity: r.quantity, unitPrice: r.unit_price,
    currency: r.currency, fee: r.fee, executedAt: r.executed_at,
  }));
}

const assetMeta = db.prepare("SELECT symbol, name FROM assets WHERE id=?");

/** Valuation in USD with asset symbols attached; display-currency conversion applied to figures. */
export function valuatePortfolio(portfolioId: string, method: CostMethod, displayCurrency = "USD"): ValuationResult & {
  displayCurrency: string; positions: any[];
} {
  const txs = portfolioTxs(portfolioId);
  const assetIds = [...new Set(txs.map((t) => t.assetId))];
  const prices = priceMapUsd(assetIds);
  const res = valuate(txs, prices, { method, baseCurrency: "USD", fx: fxRate });

  const k = displayCurrency === "USD" ? new Decimal(1) : fxRate("USD", displayCurrency);
  const conv = (s: string) => new Decimal(s).mul(k).toString();
  const round2 = (s: string) => new Decimal(s).toDecimalPlaces(2).toString();
  const positions = res.positions.map((p) => {
    const meta = assetMeta.get(p.assetId) as any;
    return {
      ...p, symbol: meta?.symbol ?? p.assetId, name: meta?.name ?? p.assetId,
      price: conv(p.price), marketValue: conv(p.marketValue), costBasis: conv(p.costBasis),
      unrealizedPnL: conv(p.unrealizedPnL), realizedPnL: conv(p.realizedPnL), avgCost: conv(p.avgCost),
      unrealizedPct: round2(p.unrealizedPct), allocationPct: round2(p.allocationPct),
    };
  });
  return {
    ...res, displayCurrency, positions,
    totals: {
      costBasis: conv(res.totals.costBasis), marketValue: conv(res.totals.marketValue),
      unrealizedPnL: conv(res.totals.unrealizedPnL), unrealizedPct: round2(res.totals.unrealizedPct),
      realizedPnL: conv(res.totals.realizedPnL),
    },
  };
}

/** Portfolio total market value + unrealized P/L in USD (for alerts). */
export function portfolioValueUsd(portfolioId: string): { value: Decimal; unrealized: Decimal } {
  const row = db.prepare("SELECT org_id FROM portfolios WHERE id=?").get(portfolioId) as any;
  const v = valuatePortfolio(portfolioId, orgMethod(row?.org_id ?? ""), "USD");
  return { value: new Decimal(v.totals.marketValue), unrealized: new Decimal(v.totals.unrealizedPnL) };
}
