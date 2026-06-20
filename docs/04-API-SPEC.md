# 04 — API Specification

REST/JSON over HTTPS. All endpoints are org-scoped via the authenticated session; the active
`org_id` is derived from the session, never trusted from the client. Live updates use **SSE**.

## Conventions

- **Auth:** session cookie (httpOnly, SameSite=Lax) holding a signed token; RBAC enforced per route.
- **Base path:** `/api`.
- **IDs:** ULID strings.
- **Money/qty:** strings in JSON to preserve decimal precision (e.g. `"0.51234567"`), never JS numbers.
- **Timestamps:** ISO-8601 UTC.
- **Pagination:** cursor-based `?limit=&cursor=` → `{ data, nextCursor }`.
- **Errors:** `{ "error": { "code": "string", "message": "human readable", "details"?: {} } }` with proper HTTP status.
- **Idempotency:** mutating imports accept `Idempotency-Key` header.

## Envelope

```json
{ "data": <payload>, "meta": { "asOf": "2026-…Z", "source": "coingecko" } }
```

## Auth & session

| Method | Path | Role | Body / notes |
|--------|------|------|--------------|
| POST | `/api/auth/login` | — | `{ email, password }` → sets cookie |
| POST | `/api/auth/logout` | any | clears cookie |
| GET | `/api/me` | any | current user + memberships + active org + role |
| POST | `/api/auth/invite` | owner/manager | `{ email, role }` → invite |
| POST | `/api/auth/accept` | — | `{ token, name, password }` |

## Organization & users

| Method | Path | Role |
|--------|------|------|
| GET / PATCH | `/api/org` | any / owner | read / update name, base_currency, cost_basis_method |
| GET | `/api/org/members` | any |
| PATCH / DELETE | `/api/org/members/:userId` | owner | change role / remove |

## Assets

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/assets?query=btc` | search supported assets (symbol/name) |
| GET | `/api/assets/:id` | asset detail + latest price |
| POST | `/api/assets` (owner) | add a token by coingecko id / contract |

## Portfolios

| Method | Path | Role |
|--------|------|------|
| GET | `/api/portfolios` | any | list with summary value + P/L |
| POST | `/api/portfolios` | manager+ | `{ name, description, baseCurrency }` |
| GET | `/api/portfolios/:id` | any | detail + holdings |
| PATCH / DELETE | `/api/portfolios/:id` | manager+ | rename / archive |
| GET | `/api/portfolios/:id/valuation?vs=USD&method=FIFO` | any | full valuation (holdings, cost, value, unrealized/realized P/L) |
| GET | `/api/portfolios/:id/history?range=30d&vs=USD` | any | value-over-time series for charts |

## Transactions

| Method | Path | Role | Notes |
|--------|------|------|-------|
| GET | `/api/portfolios/:id/transactions?limit=&cursor=` | any | ledger, filterable by asset/type/date |
| POST | `/api/portfolios/:id/transactions` | manager+ | one transaction |
| POST | `/api/portfolios/:id/transactions/import` | manager+ | multipart CSV; returns `{ imported, skipped, errors[] }` |
| POST | `/api/transactions/:txId/reverse` | manager+ | append a reversing entry (no edit/delete of ledger) |

**Transaction body**
```json
{ "assetId":"bitcoin","type":"buy","quantity":"0.5","unitPrice":"42000.00",
  "currency":"USD","fee":"12.50","executedAt":"2026-01-15T10:00:00Z","note":"OTC buy" }
```

## Prices & FX

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/prices?ids=bitcoin,ethereum&vs=USD` | latest cached prices + `asOf` + source |
| GET | `/api/prices/:assetId/series?range=90d&vs=USD` | historical price series |
| GET | `/api/fx?base=USD&quote=AZN` | latest FX rate |
| GET | `/api/stream` | **SSE**: live price ticks + fired alerts (`event: price` / `event: alert`) |

## Alerts

| Method | Path | Role |
|--------|------|------|
| GET / POST | `/api/alerts` | any / manager+ |
| PATCH / DELETE | `/api/alerts/:id` | manager+ |
| GET | `/api/alerts/events?limit=&cursor=` | any | fired history |
| POST | `/api/alerts/events/:id/ack` | any | acknowledge |
| POST | `/api/alerts/:id/test` | manager+ | send a test notification |

**Alert body**
```json
{ "portfolioId":"…", "assetId":"bitcoin", "kind":"pct_change", "threshold":"-15",
  "window":"24h", "currency":"USD", "channels":["email:cfo@acme.com","slack"], "cooldownMin":120 }
```

## Reports & exports

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/reports/holdings?portfolioId=&vs=USD&format=json\|csv\|xlsx\|pdf` | current holdings snapshot |
| GET | `/api/reports/pnl?portfolioId=&from=&to=&vs=USD&format=…` | realized + unrealized P/L statement |
| GET | `/api/reports/taxlots?portfolioId=&from=&to=&method=FIFO&format=csv` | per-lot disposals (cost, proceeds, gain) |
| GET | `/api/reports/transactions?portfolioId=&from=&to=&format=csv` | ledger export |

## Settings

| Method | Path | Role | Notes |
|--------|------|------|-------|
| GET / PATCH | `/api/settings` | owner | base currency, price provider, poll interval, channels |
| PUT | `/api/settings/secrets` | owner | set provider keys / channel secrets (stored AES-encrypted; never returned) |

## System

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | web liveness |
| GET | `/api/worker/health` | worker heartbeat + last poll time + provider status |
| GET | `/api/audit?limit=&cursor=` (owner) | audit log |

## Rate limiting & errors

- Per-IP and per-session limits on auth + export endpoints (Redis sliding window) → `429` + `Retry-After`.
- Validation errors → `400` with `details` per field. AuthZ → `403`. Missing → `404`. Upstream price
  failure → `200` with `meta.source="stale"` (degraded, never a hard failure for reads).
