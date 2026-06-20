import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Single-file SQLite store (WAL). Monetary/quantity values are stored as TEXT
// (decimal strings) and computed with decimal.js — never as floats.

const DATA_DIR = join(process.cwd(), "data");
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, "cryptotrack.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS organizations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  base_currency TEXT NOT NULL DEFAULT 'USD',
  cost_basis_method TEXT NOT NULL DEFAULT 'FIFO',  -- FIFO|AVG|HIFO|LIFO
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active',
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS memberships (
  org_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role    TEXT NOT NULL,                       -- owner|manager|analyst|viewer
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE IF NOT EXISTS assets (
  id           TEXT PRIMARY KEY,               -- coingecko id (e.g. 'bitcoin')
  symbol       TEXT NOT NULL,
  name         TEXT NOT NULL,
  decimals     INTEGER NOT NULL DEFAULT 8,
  coingecko_id TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS portfolios (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  base_currency TEXT NOT NULL DEFAULT 'USD',
  archived_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  asset_id     TEXT NOT NULL REFERENCES assets(id),
  type         TEXT NOT NULL,                  -- buy|sell|transfer_in|transfer_out|fee|airdrop|reward
  quantity     TEXT NOT NULL,                  -- decimal string
  unit_price   TEXT NOT NULL DEFAULT '0',      -- price per unit in the trade currency
  currency     TEXT NOT NULL DEFAULT 'USD',
  fee          TEXT NOT NULL DEFAULT '0',
  executed_at  TEXT NOT NULL,
  external_ref TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  reverses_id  TEXT,
  created_by   TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_tx_portfolio ON transactions(portfolio_id, executed_at);
CREATE INDEX IF NOT EXISTS ix_tx_asset ON transactions(asset_id);

CREATE TABLE IF NOT EXISTS price_snapshots (
  asset_id   TEXT NOT NULL REFERENCES assets(id),
  vs         TEXT NOT NULL,
  price      TEXT NOT NULL,
  change_24h REAL,
  market_cap REAL,
  source     TEXT NOT NULL DEFAULT 'coingecko',
  as_of      TEXT NOT NULL,
  PRIMARY KEY (asset_id, vs, as_of)
);
CREATE INDEX IF NOT EXISTS ix_price_latest ON price_snapshots(asset_id, vs, as_of DESC);

CREATE TABLE IF NOT EXISTS fx_rates (
  base  TEXT NOT NULL,
  quote TEXT NOT NULL,
  rate  TEXT NOT NULL,
  as_of TEXT NOT NULL,
  PRIMARY KEY (base, quote)
);

CREATE TABLE IF NOT EXISTS alerts (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  portfolio_id TEXT REFERENCES portfolios(id) ON DELETE CASCADE,
  asset_id     TEXT REFERENCES assets(id),
  kind         TEXT NOT NULL,                  -- price_above|price_below|pct_change|portfolio_value|pnl
  threshold    TEXT NOT NULL,
  window       TEXT NOT NULL DEFAULT '24h',
  currency     TEXT NOT NULL DEFAULT 'USD',
  channels     TEXT NOT NULL DEFAULT '[]',     -- JSON array
  cooldown_min INTEGER NOT NULL DEFAULT 60,
  enabled      INTEGER NOT NULL DEFAULT 1,
  last_state   TEXT NOT NULL DEFAULT '',       -- for edge-trigger
  last_fired_at TEXT,
  created_by   TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alert_events (
  id         TEXT PRIMARY KEY,
  alert_id   TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  org_id     TEXT NOT NULL,
  fired_at   TEXT NOT NULL DEFAULT (datetime('now')),
  observed   TEXT NOT NULL,
  message    TEXT NOT NULL,
  channels   TEXT NOT NULL DEFAULT '[]',
  acknowledged_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_alertev_org ON alert_events(org_id, fired_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  org_id    TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  value     TEXT NOT NULL DEFAULT '',
  encrypted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, key)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  actor_id   TEXT, actor_name TEXT, actor_role TEXT,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL DEFAULT '',
  entity_id  TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_audit_org ON audit_logs(org_id, created_at DESC);
`);

export default db;
