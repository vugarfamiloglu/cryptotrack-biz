import db from "./db.js";
import { newId } from "./ids.js";
import { hashPassword } from "./auth.js";

const PASSWORD = process.env.SEED_ADMIN_PASSWORD || "Treasury2026!";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "cfo@acme.test";

// Idempotent reset
for (const t of ["alert_events", "alerts", "transactions", "price_snapshots", "fx_rates", "settings", "audit_logs", "portfolios", "memberships", "organizations", "users", "assets"]) {
  db.prepare(`DELETE FROM ${t}`).run();
}

const orgId = newId();
db.prepare("INSERT INTO organizations (id, name, base_currency, cost_basis_method) VALUES (?,?,?,?)")
  .run(orgId, "Acme Holdings Inc.", "USD", "FIFO");

const hash = hashPassword(PASSWORD);
const users = [
  { email: ADMIN_EMAIL, name: "Leyla Mammadova", role: "owner" },
  { email: "manager@acme.test", name: "Tural Gasimov", role: "manager" },
  { email: "analyst@acme.test", name: "Rashad Aliyev", role: "analyst" },
  { email: "viewer@acme.test", name: "Nigar Huseynova", role: "viewer" },
];
const userIds: Record<string, string> = {};
const insUser = db.prepare("INSERT INTO users (id, email, password_hash, name, status) VALUES (?,?,?,?,'active')");
const insMember = db.prepare("INSERT INTO memberships (org_id, user_id, role) VALUES (?,?,?)");
for (const u of users) {
  const id = newId();
  userIds[u.role] = id;
  insUser.run(id, u.email, hash, u.name);
  insMember.run(orgId, id, u.role);
}
const analyst = userIds.analyst;

// Assets (CoinGecko ids)
const assets = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin", decimals: 8, price: "68000", ch: 1.2 },
  { id: "ethereum", symbol: "ETH", name: "Ethereum", decimals: 18, price: "3600", ch: -0.8 },
  { id: "solana", symbol: "SOL", name: "Solana", decimals: 9, price: "165", ch: 3.5 },
  { id: "chainlink", symbol: "LINK", name: "Chainlink", decimals: 18, price: "18", ch: 2.1 },
  { id: "usd-coin", symbol: "USDC", name: "USD Coin", decimals: 6, price: "1", ch: 0.01 },
];
const insAsset = db.prepare("INSERT INTO assets (id, symbol, name, decimals, coingecko_id, is_active) VALUES (?,?,?,?,?,1)");
const insSnap = db.prepare("INSERT INTO price_snapshots (asset_id, vs, price, change_24h, market_cap, source, as_of) VALUES (?,?,?,?,?,?,?)");
const asOf = new Date().toISOString();
for (const a of assets) {
  insAsset.run(a.id, a.symbol, a.name, a.decimals, a.id);
  insSnap.run(a.id, "USD", a.price, a.ch, null, "seed", asOf);
}

// FX (last-good) so non-USD display works offline
const insFx = db.prepare("INSERT INTO fx_rates (base, quote, rate, as_of) VALUES (?,?,?,?)");
for (const [q, r] of Object.entries({ USD: "1", EUR: "0.92", GBP: "0.79", AZN: "1.70", TRY: "32.5" })) insFx.run("USD", q, r, asOf);

// Portfolios
const pf = {
  core: newId(), yield: newId(), venture: newId(),
};
const insPf = db.prepare("INSERT INTO portfolios (id, org_id, name, description, base_currency) VALUES (?,?,?,?,?)");
insPf.run(pf.core, orgId, "Treasury Core", "Long-term BTC/ETH reserve and stablecoin float", "USD");
insPf.run(pf.yield, orgId, "Yield & Staking", "Staked ETH/SOL and LINK for protocol yield", "USD");
insPf.run(pf.venture, orgId, "Venture Book", "Early high-conviction altcoin positions", "USD");

// Transactions
const insTx = db.prepare(`INSERT INTO transactions (id, org_id, portfolio_id, asset_id, type, quantity, unit_price, currency, fee, executed_at, note, created_by)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
type T = [string, string, string, string, string, string, string, string]; // portfolio, asset, type, qty, price, fee, date, note
const txs: T[] = [
  [pf.core, "usd-coin", "buy", "150000", "1", "0", "2024-02-09", "Initial stablecoin float"],
  [pf.core, "bitcoin", "buy", "5", "45000", "250", "2024-02-10", "Treasury BTC tranche 1"],
  [pf.core, "bitcoin", "buy", "3", "62000", "300", "2024-05-03", "Treasury BTC tranche 2"],
  [pf.core, "ethereum", "buy", "40", "2500", "200", "2025-01-15", "ETH accumulation"],
  [pf.core, "ethereum", "buy", "25", "3400", "180", "2025-03-20", "ETH accumulation"],
  [pf.core, "bitcoin", "sell", "2", "67000", "200", "2025-06-01", "Partial BTC rebalance"],
  [pf.core, "ethereum", "sell", "10", "4000", "90", "2025-09-10", "ETH profit take"],

  [pf.yield, "ethereum", "buy", "60", "3000", "150", "2024-08-01", "Stake position"],
  [pf.yield, "solana", "buy", "500", "140", "120", "2024-09-12", "SOL stake"],
  [pf.yield, "solana", "buy", "300", "95", "90", "2025-02-02", "SOL add"],
  [pf.yield, "chainlink", "buy", "800", "14", "60", "2025-04-15", "LINK staking"],
  [pf.yield, "ethereum", "reward", "12", "0", "0", "2025-05-01", "Staking reward"],
  [pf.yield, "solana", "sell", "200", "175", "110", "2025-07-20", "SOL trim"],

  [pf.venture, "solana", "buy", "1000", "60", "100", "2024-11-05", "Venture SOL"],
  [pf.venture, "chainlink", "buy", "1500", "12", "80", "2025-01-20", "Venture LINK"],
  [pf.venture, "chainlink", "airdrop", "50", "0", "0", "2025-03-01", "Protocol airdrop"],
  [pf.venture, "solana", "sell", "400", "190", "120", "2025-08-30", "SOL realize gains"],
];
for (const [p, a, type, qty, price, fee, date, note] of txs) {
  insTx.run(newId(), orgId, p, a, type, qty, price, "USD", fee, new Date(date + "T14:00:00Z").toISOString(), note, analyst);
}

// Alerts
const insAlert = db.prepare(`INSERT INTO alerts (id, org_id, portfolio_id, asset_id, kind, threshold, window, currency, channels, cooldown_min, enabled, last_state, created_by)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const a1 = newId(), a2 = newId(), a3 = newId(), a4 = newId(), a5 = newId();
insAlert.run(a1, orgId, null, "bitcoin", "price_below", "60000", "spot", "USD", JSON.stringify(["inapp", "slack"]), 120, 1, "", analyst);
insAlert.run(a2, orgId, null, "ethereum", "price_above", "4000", "spot", "USD", JSON.stringify(["inapp"]), 60, 1, "", analyst);
insAlert.run(a3, orgId, null, "solana", "pct_change", "-10", "24h", "USD", JSON.stringify(["inapp", "slack"]), 180, 1, "", analyst);
insAlert.run(a4, orgId, pf.core, null, "portfolio_value", "600000", "spot", "USD", JSON.stringify(["inapp"]), 240, 1, "", analyst);
insAlert.run(a5, orgId, pf.yield, null, "pnl", "-5000", "spot", "USD", JSON.stringify(["inapp"]), 240, 1, "", analyst);

// A couple of historical fired events so the Alerts page has content
const insEv = db.prepare("INSERT INTO alert_events (id, alert_id, org_id, fired_at, observed, message, channels, acknowledged_at) VALUES (?,?,?,?,?,?,?,?)");
insEv.run(newId(), a2, orgId, new Date("2025-09-10T13:40:00Z").toISOString(), "4012.50", "ETH price ≥ 4000 USD — observed 4012.50", JSON.stringify([{ channel: "inapp", ok: true }]), null);
insEv.run(newId(), a4, orgId, new Date("2025-06-01T15:10:00Z").toISOString(), "612340.00", "Portfolio value ≥ 600000 USD — observed 612340.00", JSON.stringify([{ channel: "inapp", ok: true }]), new Date("2025-06-01T16:00:00Z").toISOString());

// Settings defaults
const insSetting = db.prepare("INSERT OR REPLACE INTO settings (org_id, key, value, encrypted) VALUES (?,?,?,0)");
insSetting.run(orgId, "price_provider", "coingecko");
insSetting.run(orgId, "poll_seconds", "60");

// eslint-disable-next-line no-console
console.log(`Seeded org "Acme Holdings Inc." with ${users.length} users, 3 portfolios, ${txs.length} transactions, 5 alerts.`);
console.log(`Login: ${ADMIN_EMAIL} / ${PASSWORD}  (also manager@/analyst@/viewer@acme.test)`);
