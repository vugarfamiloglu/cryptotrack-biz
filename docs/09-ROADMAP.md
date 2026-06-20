# 09 — Roadmap & Task Breakdown

Phased delivery. Each phase ends with something demonstrable and tested. Estimates are rough
engineer-days for a small team; adjust to your stack choice (Next.js+Postgres primary, or the
SQLite single-tenant variant for a faster MVP).

## Phase 0 — Foundations (2–3 d)
- Repo, TypeScript, lint/format, env config, Docker Compose (web + worker + postgres + redis).
- DB migrations for the core schema (§03). Seed script (org, users, assets BTC/ETH/+top, demo book).
- Auth (login/session), RBAC middleware, AES vault, audit log skeleton, health endpoints.
- **Done when:** you can log in, the schema exists, seed data loads, health checks pass.

## Phase 1 — Ledger & valuation engine (4–5 d)
- Portfolios + transactions CRUD + CSV import (mapping + validation + idempotency).
- **Valuation engine library** (FIFO + AVG; unrealized + realized; fees; FX) — pure, fully unit-tested
  (incl. the §05 worked example as a golden test).
- Read APIs: portfolio valuation, holdings.
- **Done when:** a seeded book values correctly and matches hand-computed P/L to the cent.

## Phase 2 — Prices & live data (3–4 d)
- Price-provider abstraction (CoinGecko default) + FX provider; worker poll loop + Redis cache +
  `price_snapshots`; degradation/backoff.
- `/api/prices`, price series, SSE stream; optional Binance WS ticks.
- **Done when:** dashboards show live values with `as of`; prices survive provider hiccups (stale-labeled).

## Phase 3 — Dashboard & portfolio UI (4–5 d)
- App shell (sidebar + sticky NAV header + live badge), theme (dark/light).
- Dashboard (KPIs, value-over-time, allocation, portfolios table, top movers).
- Portfolio detail (positions table — resizable cols, tabular money, P/L colors; lot drill-down).
- Transactions ledger + import wizard UI; add/reverse modals.
- **Done when:** a manager can load a book and read its full valuation visually.

## Phase 4 — Alerts (3–4 d)
- Alert rules CRUD; worker alert engine (edge-trigger + cooldown); channels (in-app + email + Slack).
- Alerts UI (rules, fired feed, acknowledge, test); SSE alert toasts + bell.
- **Done when:** a price/% threshold reliably fires once to configured channels with cooldown.

## Phase 5 — Reports & exports (2–3 d)
- Holdings, P/L statement, tax-lots, transactions reports; CSV + Excel + branded PDF (with disclaimer).
- **Done when:** an accountant can export a month-end P/L + tax-lot file.

## Phase 6 — Hardening & polish (2–3 d)
- Security headers/CSP, rate limiting, validation sweep, RBAC tests, ledger-immutability guard.
- Empty/loading/error states, a11y pass, responsive pass, reduced-motion.
- Worker leader-election/health, observability, backups doc.
- **Done when:** the security checklist (§07) passes and the app is demo-ready end to end.

## Later phases (post-MVP)
- HIFO/LIFO + specific-lot selection; Telegram + webhook channels; performance vs BTC/ETH; NAV table.
- Read-only **connectors** (Binance/Coinbase API import, Etherscan address watch).
- True multi-tenant SaaS, SSO/SAML, scheduled email digests, risk metrics (vol, drawdown).
- PWA / mobile polish.

## Cross-cutting acceptance criteria
- Every monetary number is reproducible from the immutable ledger + stored price/FX snapshot.
- No floats in money math (Decimal everywhere); reports state currency + cost-basis method + `as of`.
- Non-custodial / read-only invariant holds (no key handling, no trading).
- Disclaimers present in UI and every export.
- Test coverage: valuation engine ~100% on critical paths; ≥80% overall; alert engine integration-tested.

## Suggested milestones
- **M1 (Phases 0–1):** Auditable valuation of an imported book (headless + API).
- **M2 (Phases 2–3):** Live dashboard with real prices.
- **M3 (Phases 4–5):** Alerts + reports → a finance team can run it for real.
- **M4 (Phase 6 + later):** Hardened, then connectors/SaaS.
