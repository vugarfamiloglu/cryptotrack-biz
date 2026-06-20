# 03 — Data Model

Design principles:

- **Immutable ledger.** `transactions` are append-only; corrections are new reversing/adjusting rows,
  never edits. Holdings and P/L are *derived*, not stored as truth.
- **Exact decimals.** All quantities and money use `NUMERIC` (Postgres) / fixed-precision Decimal —
  never floats. Quantities up to 36 digits with 18 dp; money 28,8.
- **Auditable valuations.** Each computed figure references the **price snapshot** used (`as_of`,
  `source`), so any report is reproducible.
- **Multi-tenant-ready.** Every business row carries `org_id` even though MVP is single-org.
- **Public IDs** are ULIDs; soft-delete via `deleted_at` where user-facing.

## Entity overview

```
organizations 1───* users (via memberships)
organizations 1───* portfolios 1───* transactions *───1 assets
assets        1───* price_snapshots
organizations 1───* alerts 1───* alert_events
organizations 1───* fx_rates (or global)
organizations 1───* audit_logs
organizations 1───1 settings   1───* provider_keys (vaulted)
portfolios    1───* tax_lots (derived, materialized for reporting)
```

## Core tables (Postgres DDL sketch)

```sql
CREATE TABLE organizations (
  id          TEXT PRIMARY KEY,                 -- ULID
  name        TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'USD',    -- reporting currency
  cost_basis_method TEXT NOT NULL DEFAULT 'FIFO',-- FIFO|AVG|HIFO|LIFO
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,                  -- bcrypt/argon2
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active', -- active|suspended
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (                       -- user ↔ org with a role
  org_id  TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL,                         -- owner|manager|analyst|viewer
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE assets (                            -- supported coins/tokens
  id          TEXT PRIMARY KEY,                  -- e.g. 'bitcoin' (provider id)
  symbol      TEXT NOT NULL,                     -- BTC
  name        TEXT NOT NULL,                     -- Bitcoin
  decimals    INT  NOT NULL DEFAULT 8,
  coingecko_id TEXT,                             -- external mapping
  chain       TEXT,                              -- optional (eth, base, …)
  contract    TEXT,                              -- optional ERC-20 address
  is_active   BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (symbol, COALESCE(chain,''), COALESCE(contract,''))
);

CREATE TABLE portfolios (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                     -- 'Treasury', 'Trading desk'
  description TEXT DEFAULT '',
  base_currency TEXT NOT NULL DEFAULT 'USD',     -- overrides org for this book
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (                      -- IMMUTABLE ledger
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  asset_id     TEXT NOT NULL REFERENCES assets(id),
  type         TEXT NOT NULL,                    -- buy|sell|transfer_in|transfer_out|fee|airdrop|reward
  quantity     NUMERIC(36,18) NOT NULL,          -- amount of asset (>0)
  unit_price   NUMERIC(28,8),                    -- price per unit in `currency` at trade time
  currency     TEXT NOT NULL DEFAULT 'USD',      -- the cash currency of unit_price/fees
  fee          NUMERIC(28,8) NOT NULL DEFAULT 0, -- in `currency`
  fee_asset_id TEXT REFERENCES assets(id),       -- optional: fee paid in crypto
  executed_at  TIMESTAMPTZ NOT NULL,             -- when the trade happened
  external_ref TEXT,                             -- exchange tx id / import key
  note         TEXT DEFAULT '',
  created_by   TEXT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_tx_portfolio_time ON transactions(portfolio_id, executed_at);
CREATE INDEX ix_tx_asset ON transactions(asset_id);

CREATE TABLE price_snapshots (                   -- price history (for charts + reproducible reports)
  asset_id   TEXT NOT NULL REFERENCES assets(id),
  vs         TEXT NOT NULL,                      -- quote currency, e.g. USD
  price      NUMERIC(28,8) NOT NULL,
  market_cap NUMERIC(28,2),
  change_24h NUMERIC(10,4),                      -- percent
  source     TEXT NOT NULL,                      -- coingecko|cmc|binance
  as_of      TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (asset_id, vs, as_of)
);
CREATE INDEX ix_price_latest ON price_snapshots(asset_id, vs, as_of DESC);

CREATE TABLE fx_rates (                           -- USD↔EUR↔AZN …
  base   TEXT NOT NULL, quote TEXT NOT NULL,
  rate   NUMERIC(20,10) NOT NULL,
  as_of  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (base, quote, as_of)
);

CREATE TABLE alerts (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  portfolio_id TEXT REFERENCES portfolios(id) ON DELETE CASCADE, -- null = whole org
  asset_id     TEXT REFERENCES assets(id),       -- null for portfolio-level alerts
  kind         TEXT NOT NULL,                     -- price_above|price_below|pct_change|portfolio_value|pnl
  threshold    NUMERIC(28,8) NOT NULL,
  window       TEXT,                              -- 1h|24h|7d for pct_change
  currency     TEXT NOT NULL DEFAULT 'USD',
  channels     JSONB NOT NULL DEFAULT '[]',       -- ["email:cfo@x.com","slack","telegram"]
  cooldown_min INT NOT NULL DEFAULT 60,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  created_by   TEXT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE alert_events (
  id         TEXT PRIMARY KEY,
  alert_id   TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  org_id     TEXT NOT NULL,
  fired_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  observed   NUMERIC(28,8) NOT NULL,             -- value that triggered it
  message    TEXT NOT NULL,
  channels   JSONB NOT NULL,                     -- delivery results
  acknowledged_by TEXT REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ
);

CREATE TABLE tax_lots (                           -- materialized lots for reporting (derived)
  id           TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  asset_id     TEXT NOT NULL REFERENCES assets(id),
  open_tx_id   TEXT NOT NULL REFERENCES transactions(id),
  opened_at    TIMESTAMPTZ NOT NULL,
  qty_open     NUMERIC(36,18) NOT NULL,
  qty_remaining NUMERIC(36,18) NOT NULL,
  cost_per_unit NUMERIC(28,8) NOT NULL,           -- in portfolio base currency
  closed       BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE settings (                           -- per-org key/value (some vaulted)
  org_id    TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  value     TEXT NOT NULL DEFAULT '',
  encrypted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);

CREATE TABLE audit_logs (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  actor_id   TEXT, actor_name TEXT, actor_role TEXT,
  action     TEXT NOT NULL,                       -- create|update|delete|login|export|alert
  entity     TEXT NOT NULL, entity_id TEXT,
  detail     TEXT DEFAULT '',
  ip         TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Derived views (not stored as truth)

- **`holdings`** per (portfolio, asset): `Σ in − Σ out` quantity, average/lot cost, current value, P/L —
  computed by the valuation engine from the ledger + latest price. May be **materialized** to a cache
  table refreshed by the worker for fast dashboards, but the ledger remains authoritative.
- **`portfolio_valuation`**: total cost, total market value, unrealized P/L, realized P/L (period),
  allocation %, with `as_of`.

## Integrity & indexing

- FKs everywhere; `ON DELETE CASCADE` from org/portfolio down.
- `transactions` are never `UPDATE`d on financial fields (enforce via app + optional trigger).
- Hot paths indexed: latest price per asset, transactions by portfolio+time, alerts by enabled.
- Retain `price_snapshots` at high resolution for N days, then downsample (e.g. hourly→daily) for history.
