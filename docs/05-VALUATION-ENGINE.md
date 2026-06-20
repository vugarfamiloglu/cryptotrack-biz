# 05 — Valuation & P/L Engine

The engine is a **pure, deterministic library**: `valuate(ledger, prices, fx, options) → result`.
Same inputs → same outputs, no I/O, fully unit-testable. It is the single source of all monetary
figures shown anywhere in the product.

## 1. Definitions

- **Quantity (qty):** amount of an asset held. Exact decimal, up to 18 dp.
- **Cost basis:** total cash paid to acquire the asset still held (incl. buy fees), in the portfolio's
  base currency.
- **Market value:** `qty × current_price` (converted to base currency via FX).
- **Unrealized P/L:** `market_value − remaining_cost_basis`.
- **Realized P/L:** on a disposal (sell / transfer_out treated per policy), `proceeds − cost_basis_of_disposed_lots − sell_fees`.
- **Allocation:** an asset's market value ÷ portfolio market value.

All math uses fixed-precision Decimal. Rounding only at presentation (e.g. 2 dp for money, 8 for qty),
never mid-calculation.

## 2. Cost-basis methods

Supported (configurable per org, overridable per report):

| Method | Disposal picks… | Use |
|--------|-----------------|-----|
| **FIFO** | oldest lots first | Default; common for accounting/tax. |
| **LIFO** | newest lots first | Some jurisdictions. |
| **HIFO** | highest-cost lots first | Minimizes realized gains. |
| **AVG** | weighted-average cost across all open units | Simplest; some jurisdictions require it. |

> The chosen method must be applied **consistently** within a portfolio for a period; switching method
> is a deliberate, audited action. Reports state the method used.

## 3. Lot accounting (FIFO/LIFO/HIFO)

State = a queue/heap of **open lots** per (portfolio, asset): `{ openedAt, qtyRemaining, costPerUnit }`.

**On acquisition** (`buy`, `transfer_in` with known cost, `airdrop`/`reward` at FMV):
- `costPerUnit = (qty × unitPrice + fee) / qty` (in base currency, FX-converted at `executedAt`).
- Push a new lot `{ openedAt: executedAt, qtyRemaining: qty, costPerUnit }`.

**On disposal** (`sell`, `transfer_out` per policy):
- `proceeds = qty × unitPrice − fee` (base currency).
- Consume lots in method order until `qty` is covered:
  - For each consumed slice `s`: `costOfSlice = s.qty × lot.costPerUnit`; decrement `lot.qtyRemaining`.
- `realizedPnL += proceeds − Σ costOfSlice`.
- Record a **disposal row** (for tax-lot report): opened lot, qty, cost, proceeds, gain, holding period.

**Remaining cost basis** (for unrealized) = `Σ lot.qtyRemaining × lot.costPerUnit` over open lots.

Edge cases: disposing more than held → flag a negative-balance error (data issue); transfers between
two tracked portfolios → move the lot, no realized event.

## 4. Average-cost method

Maintain per (portfolio, asset): `qty` and `totalCost`.
- **Acquire:** `qty += dq; totalCost += dq × unitPrice + fee`.
- **Dispose `dq`:** `avg = totalCost / qty`; `realizedPnL += proceeds − dq × avg`; then
  `totalCost −= dq × avg; qty −= dq`.
- **Unrealized:** `qty × price − qty × avg`.

## 5. Multi-currency / FX

- Each transaction stores its trade `currency`. Cost is converted to the **portfolio base currency**
  using the FX rate at `executedAt` (historical) — stored so reports are reproducible.
- Display currency is selectable (USD/EUR/AZN…); current values convert at the latest FX rate.
- Crypto prices are quoted in a chosen `vs` (default USD); chained through FX to the base/display currency.

## 6. Fees & special types

- **Buy fee** → added to cost basis. **Sell fee** → reduces proceeds.
- **Fee paid in crypto** (`fee_asset_id`) → a disposal of that asset at FMV (its own realized event) +
  the fiat-equivalent added/subtracted from the trade it belongs to.
- **Airdrop / reward / staking income** → acquired at fair market value on receipt; FMV becomes both
  income (for reporting) and the lot's cost basis.
- **Transfer in/out** between untracked wallets → quantity moves; cost basis carried if known, else
  marked "unknown basis" and surfaced in reports.

## 7. Worked example (FIFO)

Portfolio base = USD.

| # | Date | Type | Asset | Qty | Unit price | Fee |
|---|------|------|-------|-----|-----------|-----|
| 1 | Jan 1 | buy | BTC | 1.0 | $30,000 | $30 |
| 2 | Feb 1 | buy | BTC | 1.0 | $40,000 | $40 |
| 3 | Mar 1 | sell | BTC | 1.5 | $50,000 | $75 |

- Lot A cost/unit = (1×30000+30)/1 = **30,030**. Lot B cost/unit = (1×40000+40)/1 = **40,040**.
- Sell 1.5 @ 50,000, fee 75 → proceeds = 1.5×50000 − 75 = **74,925**.
- FIFO consumes Lot A (1.0 @30,030 = 30,030) + 0.5 of Lot B (0.5×40,040 = 20,020) → cost = **50,050**.
- **Realized P/L = 74,925 − 50,050 = +24,875.**
- Remaining: 0.5 BTC in Lot B, cost basis 20,020. If BTC now = $52,000 →
  market value = 0.5×52,000 = 26,000 → **Unrealized P/L = 26,000 − 20,020 = +5,980.**

This exact case is a unit-test fixture (see §9).

## 8. Outputs

```ts
interface ValuationResult {
  asOf: string; baseCurrency: string; method: 'FIFO'|'AVG'|'HIFO'|'LIFO';
  totals: { costBasis: Decimal; marketValue: Decimal; unrealizedPnL: Decimal; unrealizedPct: Decimal;
            realizedPnL: Decimal /* over requested period */ };
  positions: Array<{
    assetId: string; symbol: string; qty: Decimal;
    avgCost: Decimal; price: Decimal; priceSource: string;
    marketValue: Decimal; costBasis: Decimal;
    unrealizedPnL: Decimal; unrealizedPct: Decimal; allocationPct: Decimal;
    change24hPct: Decimal | null;
  }>;
  disposals?: Array<{ assetId; openedAt; closedAt; qty; cost; proceeds; gain; longTerm: boolean }>;
}
```

## 9. Testing requirements

- Golden-file unit tests for each method against hand-computed books (incl. the §7 example).
- Property tests: Σ realized + Σ unrealized is invariant to method only at full liquidation; cost basis
  never goes negative; disposing exactly all qty → remaining cost basis = 0.
- Decimal-precision tests (no float drift) and FX-chaining tests.
- Determinism test: shuffling input order (within same timestamps) yields identical method-ordered results.
