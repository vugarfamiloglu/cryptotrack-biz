# CryptoTrack Biz — Crypto Portfolio Tracker for Business Investments

A **non-custodial crypto treasury analytics** platform for companies. CryptoTrack Biz
values multiple corporate crypto portfolios the way a CFO reads a balance sheet:
cost-basis accounting, realized & unrealized profit/loss, and live price & P/L alerts —
without ever holding keys or moving funds.

> **Treasury Terminal** — a slate/ink desk with a teal "balance" accent, tabular-mono
> money, and a live Net Asset Value ticker. Green/red is reserved strictly for the sign
> of a P/L figure.

---

## Why it exists

Spreadsheets break the moment a treasury holds more than a handful of lots across BTC,
ETH and a few alts. Cost basis drifts, realized gains get mis-stated, and nobody notices
a 30% drawdown until the next board meeting. CryptoTrack Biz turns an append-only
transaction ledger into a defensible valuation:

- **Deterministic valuation engine** — FIFO / AVG / HIFO / LIFO cost basis, lot
  accounting, fees and FX, computed with `decimal.js` (40-digit precision, never floats).
- **Realized + unrealized P/L** per position, per portfolio, and consolidated.
- **Live prices** from CoinGecko (keyless) with last-good fallback, polled in-process.
- **Edge-triggered alerts** on price, 24h change, portfolio value and P/L — fired once
  per crossing, with cooldown and in-app / Slack / email channels.
- **Read-only & non-custodial** — the app never has private keys, never signs, never moves money.

---

## The valuation engine (the technical heart)

`src/engine/valuation.ts` is a **pure, deterministic function**:

```ts
valuate(transactions, prices, { method, baseCurrency, fx }) → {
  positions[], totals, disposals[]
}
```

- **Lot accounting** — every acquisition (`buy`, `transfer_in`, `airdrop`, `reward`)
  opens a lot at its all-in cost; every disposal (`sell`, `transfer_out`, `fee`) consumes
  lots in the order the chosen method dictates.
- **Methods** — FIFO (oldest lot first), LIFO (newest first), HIFO (highest cost first,
  minimizes gains), AVG (running average cost).
- **Realized P/L** comes only from `sell`s: proceeds − consumed cost − fee.
- **Unrealized P/L** = market value − remaining cost basis, marked at the live price.

It ships with a **golden test** (`valuation.test.ts`) that checks the engine against
hand-computed figures across FIFO, AVG and HIFO:

```
$ npm run test:engine
✅ ALL PASS — 11 passed, 0 failed
```

Because valuation is a pure function of `(ledger, prices, method)`, the same inputs always
produce the same statement — switching FIFO → HIFO in the UI recomputes realized P/L live
(e.g. Treasury Core: **+$58,560 FIFO → +$15,438 HIFO**).

---

## Features

| Area | What you get |
|------|--------------|
| **Dashboard** | Consolidated NAV, unrealized/realized P/L, allocation donut, 24h movers, value-by-portfolio bars, recent alert feed, live NAV ticker |
| **Portfolios** | Multi-portfolio books, per-portfolio valuation, method & display-currency switch, archive |
| **Positions** | Qty, avg cost, live price, market value, cost basis, unrealized P/L & %, realized P/L, allocation %, 24h |
| **Ledger** | Immutable append-only transactions; corrections via balancing **reversals** (`reverses_id`); CSV import |
| **Alerts** | `price_above` / `price_below` / `pct_change` / `portfolio_value` / `pnl`; edge-trigger + cooldown; test dispatch; fired-events feed |
| **Assets** | Track any CoinGecko asset; live price + 24h change |
| **Reports** | Per-portfolio holdings statement as **CSV** and branded **PDF** (PDFKit) |
| **Governance** | Full audit log (actor / role / action / IP), RBAC, in-app activity log monitor |
| **Settings** | Org base currency & cost-basis method, poll interval, AES-256-GCM vaulted secrets (Slack webhook, CoinGecko key) |

Plus the house standards: **dark + light** theme, **resizable table columns**, **hover-data
charts**, **collapsible sidebar** (divider-mounted tab), **SSE live** price ticks & alerts,
**ConfirmModal / PromptModal** for destructive / input actions, **show/hide** secret inputs.

---

## Architecture

```
┌─────────────── React SPA (Vite) ───────────────┐      ┌──────── Express (TS, ESM) ────────┐
│  AppShell · Dashboard · Portfolios · Detail     │      │  /api/auth   jose HS256 + bcrypt   │
│  Alerts · Assets · Reports · Audit · Logs · …    │ ───► │  /api/portfolios · /transactions  │
│  Chart.js · SSE live store · theme · toasts     │ JSON │  /api/alerts · /assets · /prices   │
└─────────────────────────────────────────────────┘      │  /api/dashboard · /settings · …    │
                                                          │  /api/stream  (SSE)               │
                       ┌─────────────────────────────────┤                                    │
   valuation.ts  ◄─────┤  service.ts → valuate(ledger,…)  │  worker: poll prices + FX + alerts │
   (pure, decimal.js)  └─────────────────────────────────┤  better-sqlite3 (WAL) · AES vault  │
                                                          └────────────────────────────────────┘
        prices: CoinGecko (keyless) + open.er-api.com FX, cached → snapshot → seed fallback
```

- **Single process** — Express serves both the JSON API and the built SPA (`web/dist`).
- **In-process worker** — `setInterval` polls prices every `PRICE_POLL_SECONDS`, evaluates
  alerts, and broadcasts ticks over SSE; a `node-cron` job refreshes FX daily.
- **Degrades gracefully** — if CoinGecko is unreachable, the last-good cache / DB snapshot
  keeps valuation working.

### Tech stack

Node 20+ · TypeScript (ESM, run with `tsx`) · Express · better-sqlite3 (WAL) ·
decimal.js · jose · bcryptjs · node-cron · PDFKit · React 18 · Vite 6 · Chart.js ·
React Router. Fonts: Space Grotesk / Inter / JetBrains Mono.

---

## Quick start

```bash
# 1. Backend deps
npm install

# 2. Seed a demo org (Acme Holdings: 4 users, 3 portfolios, 17 transactions, 5 alerts)
npm run seed

# 3. Build the SPA
npm run build:web

# 4. Run (serves API + SPA on http://localhost:6800)
npm start
```

Open **http://localhost:6800** and sign in:

| Email | Role | Password |
|-------|------|----------|
| `cfo@acme.test` | owner | `Treasury2026!` |
| `manager@acme.test` | manager | `Treasury2026!` |
| `analyst@acme.test` | analyst | `Treasury2026!` |
| `viewer@acme.test` | viewer | `Treasury2026!` |

### Dev mode (hot reload)

```bash
npm run dev                 # API on :6800 (tsx watch)
cd web && npm run dev       # Vite on :6810, proxies /api → :6800
```

### Scripts

| Script | Action |
|--------|--------|
| `npm start` | Run the server (API + built SPA) |
| `npm run dev` | API with watch reload |
| `npm run seed` | Reset + seed the demo organization |
| `npm run test:engine` | Run the valuation golden tests |
| `npm run build:web` | Install + build the React client into `web/dist` |

---

## Roles (RBAC)

`viewer (1) < analyst (2) < manager (3) < owner (4)`

- **viewer** — read dashboards, portfolios, reports.
- **analyst** — add/import/reverse transactions, create & test alerts.
- **manager** — create portfolios & assets, delete alerts, edit org settings.
- **owner** — everything.

Sessions are stateless `jose` HS256 cookies (`ctb_session`, 7-day); passwords are bcrypt.

---

## Security

- **Non-custodial** — no private keys, no signing, no fund movement. Ever.
- Provider secrets (Slack webhook, CoinGecko key) are encrypted at rest with
  **AES-256-GCM** (`src/vault.ts`); the master key lives in `data/.vault-key` (or `VAULT_KEY`).
- Parameterized SQL throughout; org-scoped queries on every route.
- Immutable ledger — transactions are never edited or deleted; corrections post reversals.
- Full **audit log** of every state change with actor, role and source IP.
- `.env` and `data/` are git-ignored; secrets never touch source control.

> CryptoTrack Biz produces **analytical reports** from public market data and your own
> records. It is not custody software, accounting advice, or investment advice.

---

## Project structure

```
src/
  engine/valuation.ts      ← pure cost-basis valuation (FIFO/AVG/HIFO/LIFO) + tests
  service.ts               ← ledger → valuation glue, display-currency conversion
  prices.ts                ← CoinGecko prices + FX, cache → snapshot → seed fallback
  alerts.ts                ← edge-trigger alert engine + channel dispatch
  routes/                  ← auth, portfolios, transactions, alerts, market, admin
  db.ts vault.ts auth.ts context.ts audit.ts settings.ts sse.ts logbus.ts
  index.ts                 ← Express app + in-process worker
  seed.ts                  ← demo organization
web/
  src/pages/               ← Login, Dashboard, Portfolios, PortfolioDetail, Transactions,
                              Alerts, Assets, Reports, Audit, Logs, Settings
  src/components/          ← AppShell, DataTable, charts, Icon, ui primitives
  src/providers/           ← auth, theme, toast, dialogs, live (SSE)
docs/                      ← full technical specification (PRD → roadmap)
```

The `docs/` folder holds the original technical specification this implementation was
built against (data model, valuation engine, API contract, security model, roadmap).

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
