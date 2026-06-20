import { valuate, type Tx } from "./valuation.js";

let passed = 0, failed = 0;
function eq(label: string, got: string | number, want: string | number) {
  const ok = Number(got).toFixed(6) === Number(want).toFixed(6);
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}: got ${got}${ok ? "" : `, want ${want}`}`);
  ok ? passed++ : failed++;
}

// --- Golden FIFO example (docs/05) -----------------------------------------
const ledger: Tx[] = [
  { assetId: "bitcoin", type: "buy", quantity: "1", unitPrice: "30000", currency: "USD", fee: "30", executedAt: "2026-01-01T00:00:00Z" },
  { assetId: "bitcoin", type: "buy", quantity: "1", unitPrice: "40000", currency: "USD", fee: "40", executedAt: "2026-02-01T00:00:00Z" },
  { assetId: "bitcoin", type: "sell", quantity: "1.5", unitPrice: "50000", currency: "USD", fee: "75", executedAt: "2026-03-01T00:00:00Z" },
];
const prices = { bitcoin: { price: "52000", change24h: 1.2, source: "test" } };

console.log("FIFO:");
const fifo = valuate(ledger, prices, { method: "FIFO", baseCurrency: "USD" });
eq("realized P/L", fifo.totals.realizedPnL, 24875);
eq("remaining qty", fifo.positions[0].qty, 0.5);
eq("remaining cost basis", fifo.positions[0].costBasis, 20020);
eq("market value", fifo.positions[0].marketValue, 26000);
eq("unrealized P/L", fifo.positions[0].unrealizedPnL, 5980);
eq("allocation %", fifo.positions[0].allocationPct, 100);

// --- Average cost on the same book -----------------------------------------
// avg cost after 2 buys = (30030 + 40040) / 2 = 35035 per BTC
// sell 1.5: cost = 1.5*35035 = 52552.5; proceeds = 74925; realized = 22372.5
// remaining 0.5 @ 35035 = 17517.5; mv 26000 → unrealized 8482.5
console.log("AVG:");
const avg = valuate(ledger, prices, { method: "AVG", baseCurrency: "USD" });
eq("realized P/L", avg.totals.realizedPnL, 22372.5);
eq("remaining cost basis", avg.positions[0].costBasis, 17517.5);
eq("unrealized P/L", avg.positions[0].unrealizedPnL, 8482.5);

// --- HIFO: sell consumes Lot B (40040) first, then 0.5 of Lot A ------------
// cost = 40040 + 0.5*30030 = 55055; realized = 74925 - 55055 = 19870
// remaining 0.5 of Lot A @ 30030 = 15015; mv 26000 → unrealized 10985
console.log("HIFO:");
const hifo = valuate(ledger, prices, { method: "HIFO", baseCurrency: "USD" });
eq("realized P/L", hifo.totals.realizedPnL, 19870);
eq("remaining cost basis", hifo.positions[0].costBasis, 15015);

console.log(`\n${failed === 0 ? "✅ ALL PASS" : "❌ FAIL"} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
