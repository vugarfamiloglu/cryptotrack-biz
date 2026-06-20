# 02 — Architecture

## 1. High-level overview

CryptoTrack Biz is a three-process system over a shared datastore:

```
                         ┌──────────────────────────────────────────┐
                         │                Web / API                  │
   Browser  ───────────► │  Next.js 15 (App Router + Route Handlers) │
   (dashboard, reports)  │  - pages + server actions                 │
                         │  - REST/JSON API + SSE (live updates)     │
                         │  - auth, RBAC, valuation reads            │
                         └───────────────┬───────────────┬──────────┘
                                         │               │
                          ┌──────────────▼───┐   ┌───────▼───────────┐
                          │   PostgreSQL      │   │      Redis        │
                          │  (system of record│   │ price cache,      │
                          │   ledger, lots,   │   │ rate limits,      │
                          │   alerts, audit)  │   │ pub/sub for SSE   │
                          └──────────────▲───┘   └───────▲───────────┘
                                         │               │
                         ┌───────────────┴───────────────┴──────────┐
                         │              Worker process               │
                         │  - price poller (cron) → cache + snapshot │
                         │  - FX poller                              │
                         │  - alert engine (evaluate rules)          │
                         │  - notification dispatch (email/Slack/…)  │
                         └───────────────┬──────────────────────────┘
                                         │
        ┌────────────────────────────────┼─────────────────────────────────┐
        ▼                ▼                ▼                ▼                 ▼
   CoinGecko        CoinMarketCap     Binance WS        FX provider     Notification
   (keyless)        (api key)         (live ticks)      (exchangerate)  channels (SMTP,
                                                                         Slack, Telegram, webhook)
```

The **Web/API** serves UI + reads; the **Worker** owns all outbound integrations and time-driven work
(price/FX polling, alert evaluation, notifications). They communicate only through Postgres + Redis,
so each can scale and restart independently.

## 2. Components

| Component | Responsibility |
|-----------|----------------|
| **Web/API** | Auth, RBAC, CRUD for orgs/portfolios/transactions/alerts, valuation read APIs, dashboard, reports/exports, SSE stream for live prices/alerts. |
| **Worker** | Poll prices (per active asset) + FX on a schedule; write to Redis cache + `price_snapshots`; evaluate alert rules; send notifications with cooldown; publish updates to Redis for SSE. |
| **Valuation engine** | Pure, deterministic library (shared by API + worker): given a ledger + prices, compute holdings, cost basis, realized/unrealized P/L. No side effects. |
| **Price provider layer** | Abstraction over CoinGecko/CMC/Binance with a single `getPrices(assets, vs)` + `streamPrices()` interface, rate-limit + fallback handling. |
| **Notification layer** | Channel adapters (email/Slack/Telegram/webhook) behind one `send(channel, payload)`. |
| **PostgreSQL** | Source of truth: immutable transaction ledger, derived snapshots, alerts, audit, settings, vaulted keys. |
| **Redis** | Hot price cache (short TTL), API rate limiting, pub/sub for server-sent events, alert cooldown keys, optional BullMQ queues. |

## 3. Data flow

**Valuation read (dashboard):**
1. Browser requests `/api/portfolios/:id/valuation?vs=USD`.
2. API loads ledger + latest cached prices (Redis → fallback Postgres snapshot).
3. Valuation engine computes holdings + P/L (pure function).
4. Response returned with `as_of` timestamps + price source; SSE pushes deltas as new ticks arrive.

**Price + alert cycle (worker, every N seconds/minutes):**
1. Collect the set of assets held across all portfolios.
2. Fetch prices (batched) from the active provider; on failure, fall back / keep last good (flagged stale).
3. Write to Redis cache + append `price_snapshots`.
4. Evaluate enabled alert rules against new prices/portfolio values.
5. For each crossing not in cooldown: record `alert_events`, dispatch notifications, set cooldown key, publish to SSE.

## 4. Tech-stack decision

**Primary (recommended):**

| Layer | Choice | Why |
|-------|--------|-----|
| Language | **TypeScript** end-to-end | One language, shared types between API/worker/engine, decimal-safe with libraries. |
| Web/API | **Next.js 15** (App Router) | SSR dashboards, route handlers for REST + SSE, server actions for forms, one deployable web tier. |
| Worker | **Node.js** process, `node-cron` (→ BullMQ/Redis when scaling) | Background polling + alert engine independent of request lifecycle. |
| DB | **PostgreSQL** | Relational integrity for a financial ledger, `NUMERIC` for exact decimals, strong indexing, JSONB for flexible metadata. |
| Cache/queue | **Redis** | Sub-second price cache, rate limiting, pub/sub for SSE, cooldown, queues. |
| Decimals | **decimal.js** (or `Prisma.Decimal`) | No float drift in money/quantity math. |
| Charts | **Chart.js** | Value-over-time, allocation, P/L visuals. |
| Auth | Session/JWT cookie + RBAC middleware | Standard, deployable, Edge-safe verification. |
| Secrets | **AES-256-GCM vault** | Provider API keys + channel secrets encrypted at rest. |
| Exports | `exceljs` (xlsx), `pdfkit` (PDF), CSV streaming | Accountant-ready outputs. |

**Lightweight alternative (single-tenant self-host):** Next.js + **better-sqlite3** (WAL) + in-process
`node-cron` worker + in-memory cache. Same engine and API; swap the storage/queue adapters. Good for
a single company running it on one box.

**Why not a separate Express API + React SPA?** Viable, but Next.js collapses web + API + SSR into one
tier and still exposes REST route handlers, reducing moving parts. The worker stays a separate process
regardless.

## 5. Deployment topology

- **Dev:** one machine — Next.js (`:6500`), worker process, local Postgres + Redis (or SQLite + in-proc worker).
- **Prod:** Web/API (1..N replicas behind a load balancer) + **one** worker (leader-elected if >1) +
  managed Postgres + managed Redis. Static assets via CDN. Secrets via env/secret manager; vault key
  injected, never in the repo.
- **Containers:** multi-stage Docker images for web and worker; `docker-compose` for local
  (web, worker, postgres, redis). Health/readiness endpoints on both processes.

## 6. Cross-cutting concerns

- **Idempotency & exactness:** transactions are append-only; valuations are recomputed deterministically; money/qty are `NUMERIC`/Decimal.
- **Resilience:** price provider failures degrade to last-good (labeled stale); circuit breaker + backoff; alert engine never crashes the poll loop (per-rule try/catch).
- **Observability:** structured logs, request IDs, per-poll metrics (latency, provider errors), in-app activity/log view.
- **Scaling:** API scales horizontally (stateless); worker is singular for correctness (or sharded by asset with locks); Postgres read replicas for reporting; Redis for hot reads.
