# 01 — Product Requirements Document (PRD)

## 1. Vision

Give finance teams at crypto-exposed companies a single, trustworthy place to see **what they hold,
what it's worth, and whether they're up or down** — with the rigor an auditor expects and the
alerting a treasurer needs. CryptoTrack Biz turns a messy spread of exchange exports and wallet
balances into a clean, valued, reportable portfolio.

## 2. Problem

Companies increasingly hold crypto (treasury reserves, payments, investments, vesting tokens), but:

- Holdings are scattered across exchanges, custodians and wallets.
- Spreadsheets don't value positions live, don't compute cost basis correctly, and break under audit.
- No one is alerted when a position swings 20% or crosses a risk threshold.
- Accountants need realized/unrealized P/L and tax lots; boards need a clean monthly snapshot.

## 3. Target users & personas

| Persona | Role | Primary needs |
|---------|------|---------------|
| **Treasury / Finance Manager** | Owns the portfolio | Live value, P/L, allocation, risk alerts, monthly board report. |
| **Investment Analyst** | Tracks performance | Performance over time, per-asset breakdown, what-if & trends. |
| **Accountant / Auditor** | Books & tax | Realized/unrealized P/L, cost basis (FIFO/AVG), tax lots, immutable ledger, exports. |
| **CFO / Executive (Viewer)** | Oversight | High-level dashboard, P/L, exposure — read-only. |
| **Org Admin** | Setup & access | Manage users/roles, connect price providers, configure alert channels. |

## 4. Goals & non-goals

**Goals**
- Accurate, auditable valuation and P/L for an organization's crypto holdings.
- Configurable, reliable alerting on price and portfolio movements.
- Clear dashboards and exportable reports for finance and the board.
- Multi-portfolio, multi-currency, role-based, single organization (tenant) per deployment (MVP).

**Non-goals (explicitly out of scope)**
- **No trading / order execution.** Read-only tracking only.
- **No custody / key management.** The platform never holds private keys or signs transactions.
- No investment advice, signals, or automated strategies.
- No tax filing — we produce inputs (tax-lot reports), not filings.
- (MVP) No automatic exchange/wallet sync — manual + CSV import first; connectors are a later phase.

## 5. Scope & prioritization (MoSCoW)

### MVP — Must have
1. Org + users + RBAC (Owner, Manager, Analyst, Viewer).
2. Portfolios CRUD.
3. Transactions CRUD + CSV import (buy/sell/transfer/fee).
4. Supported assets catalog (BTC, ETH, + top-N coins) with metadata.
5. Live prices (CoinGecko keyless) with caching + price history snapshots.
6. Holdings derivation + **valuation & P/L engine** (FIFO + Average cost; unrealized + realized).
7. Multi-currency display (USD/EUR/AZN) via FX.
8. Dashboard: portfolio list, total value, total P/L, value-over-time chart, allocation donut, top movers.
9. Alerts: price above/below, % change (24h), portfolio value threshold → in-app + email + Slack webhook; cooldown.
10. Reports: holdings snapshot, P/L statement, transaction ledger → CSV + PDF export.
11. Audit log + secret vault for provider keys.

### Should have
- HIFO/LIFO cost basis, specific-lot selection.
- Excel (.xlsx) export, tax-lot report.
- Telegram + generic webhook alert channels.
- Performance benchmark vs BTC/ETH; realized-gains calendar.
- WebSocket live price ticks on dashboard.

### Could have
- Exchange/wallet read-only connectors (Binance, Coinbase, Etherscan address watch).
- Multi-org (true multi-tenant SaaS), SSO/SAML.
- Scenario / stress testing; risk metrics (volatility, max drawdown, VaR-lite).
- Mobile-optimized PWA, scheduled email digests.

### Won't have (this version)
- Trading, custody, lending/staking execution, fiat on/off-ramp.

## 6. Key user journeys

1. **Onboard** → admin creates org, invites finance team, picks reporting currency, connects alert channel.
2. **Load holdings** → manager creates "Treasury" portfolio, imports a CSV of buys, or adds transactions manually.
3. **See value** → dashboard shows total value, P/L, allocation; portfolio detail shows each position with cost basis and unrealized P/L.
4. **Get alerted** → BTC drops 15% in 24h → Slack + email alert fires (once, respecting cooldown).
5. **Report** → accountant exports a month-end P/L statement + tax-lot CSV for the books.

## 7. Success metrics

- **Accuracy:** valuation/P/L matches a hand-computed reference within rounding for seeded test books (100%).
- **Freshness:** dashboard prices ≤ 2 min stale under normal operation.
- **Alert reliability:** ≥ 99% of threshold crossings fire within one poll interval; zero duplicate floods (cooldown enforced).
- **Adoption:** finance team can produce a month-end report without leaving the app.
- **Performance:** dashboard first load < 2.5 s; portfolio valuation for 1k transactions < 300 ms (cached prices).

## 8. Constraints & assumptions

- Free price APIs are rate-limited → must cache aggressively and degrade gracefully (stale-but-labeled).
- Crypto prices are volatile and sometimes unavailable → every value carries an "as of" timestamp and source.
- Numbers must be **decimal-exact** (no float drift) — use fixed-precision decimals for quantities and money.
- Single organization per deployment in MVP; data model is multi-tenant-ready for later.
- All figures are informational; UI and reports carry a "not investment/tax advice" disclaimer.
