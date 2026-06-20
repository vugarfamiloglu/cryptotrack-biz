import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const D = (x: string | number | undefined | null) => new Decimal(x ?? 0);

export type CostMethod = "FIFO" | "AVG" | "HIFO" | "LIFO";

export interface Tx {
  assetId: string;
  type: string; // buy|sell|transfer_in|transfer_out|fee|airdrop|reward
  quantity: string;
  unitPrice: string;
  currency: string;
  fee: string;
  executedAt: string;
}
export interface PriceInfo { price: string; change24h?: number | null; source?: string; }
export type PriceMap = Record<string, PriceInfo>;
export type FxRate = (from: string, to: string) => Decimal; // 1 `from` -> `to`

export interface Disposal {
  assetId: string; openedAt: string; closedAt: string;
  qty: string; cost: string; proceeds: string; gain: string;
}
export interface Position {
  assetId: string; qty: string; avgCost: string; price: string; priceSource: string;
  marketValue: string; costBasis: string; unrealizedPnL: string; unrealizedPct: string;
  realizedPnL: string; allocationPct: string; change24hPct: number | null;
}
export interface ValuationResult {
  method: CostMethod; baseCurrency: string;
  totals: { costBasis: string; marketValue: string; unrealizedPnL: string; unrealizedPct: string; realizedPnL: string };
  positions: Position[];
  disposals: Disposal[];
}

const ADD = new Set(["buy", "transfer_in", "airdrop", "reward"]);
const SUB = new Set(["sell", "transfer_out", "fee"]);

interface Lot { qty: Decimal; cost: Decimal; openedAt: string } // cost = per-unit cost basis

export function valuate(
  txs: Tx[], prices: PriceMap, opts: { method?: CostMethod; baseCurrency?: string; fx?: FxRate },
): ValuationResult {
  const method = opts.method ?? "FIFO";
  const base = opts.baseCurrency ?? "USD";
  const fx = opts.fx ?? (() => new Decimal(1));

  // group + sort chronologically (stable)
  const byAsset = new Map<string, Tx[]>();
  for (const t of txs) {
    if (!byAsset.has(t.assetId)) byAsset.set(t.assetId, []);
    byAsset.get(t.assetId)!.push(t);
  }
  for (const list of byAsset.values()) list.sort((a, b) => a.executedAt.localeCompare(b.executedAt));

  const positions: Position[] = [];
  const disposals: Disposal[] = [];
  let totalMV = new Decimal(0), totalCost = new Decimal(0), totalUnreal = new Decimal(0), totalReal = new Decimal(0);

  for (const [assetId, list] of byAsset) {
    let lots: Lot[] = [];
    let avgQty = new Decimal(0), avgCostTotal = new Decimal(0); // for AVG method
    let realized = new Decimal(0);

    for (const t of list) {
      const q = D(t.quantity).abs();
      if (q.isZero()) continue;
      const fxr = fx(t.currency, base);
      const unit = D(t.unitPrice).mul(fxr);
      const fee = D(t.fee).mul(fxr);

      if (ADD.has(t.type)) {
        const cost = unit.mul(q).plus(fee);           // total cost basis (base ccy)
        const perUnit = cost.div(q);
        if (method === "AVG") { avgQty = avgQty.plus(q); avgCostTotal = avgCostTotal.plus(cost); }
        else lots.push({ qty: q, cost: perUnit, openedAt: t.executedAt });
      } else if (SUB.has(t.type)) {
        const isSale = t.type === "sell";
        const proceeds = isSale ? unit.mul(q).minus(fee) : new Decimal(0);
        let remaining = q, costConsumed = new Decimal(0);

        if (method === "AVG") {
          const per = avgQty.isZero() ? new Decimal(0) : avgCostTotal.div(avgQty);
          const take = Decimal.min(remaining, avgQty);
          costConsumed = per.mul(take);
          avgQty = avgQty.minus(take); avgCostTotal = avgCostTotal.minus(costConsumed);
          remaining = remaining.minus(take);
        } else {
          const order = method === "FIFO" ? lots
            : method === "LIFO" ? [...lots].reverse()
            : [...lots].sort((a, b) => b.cost.cmp(a.cost)); // HIFO
          for (const lot of order) {
            if (remaining.lte(0)) break;
            if (lot.qty.lte(0)) continue;
            const take = Decimal.min(remaining, lot.qty);
            costConsumed = costConsumed.plus(take.mul(lot.cost));
            if (isSale) disposals.push({ assetId, openedAt: lot.openedAt, closedAt: t.executedAt, qty: take.toString(), cost: take.mul(lot.cost).toString(), proceeds: take.div(q).mul(proceeds).toString(), gain: take.div(q).mul(proceeds).minus(take.mul(lot.cost)).toString() });
            lot.qty = lot.qty.minus(take);
            remaining = remaining.minus(take);
          }
          lots = lots.filter((l) => l.qty.gt(0));
        }
        if (isSale) realized = realized.plus(proceeds.minus(costConsumed));
      }
    }

    // remaining position
    let qtyRem: Decimal, costRem: Decimal;
    if (method === "AVG") { qtyRem = avgQty; costRem = avgCostTotal; }
    else { qtyRem = lots.reduce((s, l) => s.plus(l.qty), new Decimal(0)); costRem = lots.reduce((s, l) => s.plus(l.qty.mul(l.cost)), new Decimal(0)); }

    const pi = prices[assetId];
    const price = D(pi?.price);
    const mv = qtyRem.mul(price);
    const unreal = mv.minus(costRem);
    const avgCost = qtyRem.isZero() ? new Decimal(0) : costRem.div(qtyRem);

    totalMV = totalMV.plus(mv); totalCost = totalCost.plus(costRem);
    totalUnreal = totalUnreal.plus(unreal); totalReal = totalReal.plus(realized);

    // hide fully-closed positions with no realized history? keep if qty>0 OR realized!=0
    if (qtyRem.gt(0) || !realized.isZero()) {
      positions.push({
        assetId, qty: qtyRem.toString(), avgCost: avgCost.toString(), price: price.toString(),
        priceSource: pi?.source ?? "—", marketValue: mv.toString(), costBasis: costRem.toString(),
        unrealizedPnL: unreal.toString(), unrealizedPct: costRem.isZero() ? "0" : unreal.div(costRem).mul(100).toString(),
        realizedPnL: realized.toString(), allocationPct: "0", change24hPct: pi?.change24h ?? null,
      });
    }
  }

  // allocation % (of market value), sorted by market value desc
  for (const p of positions) p.allocationPct = totalMV.isZero() ? "0" : D(p.marketValue).div(totalMV).mul(100).toString();
  positions.sort((a, b) => D(b.marketValue).cmp(D(a.marketValue)));

  return {
    method, baseCurrency: base,
    totals: {
      costBasis: totalCost.toString(), marketValue: totalMV.toString(),
      unrealizedPnL: totalUnreal.toString(), unrealizedPct: totalCost.isZero() ? "0" : totalUnreal.div(totalCost).mul(100).toString(),
      realizedPnL: totalReal.toString(),
    },
    positions, disposals,
  };
}
