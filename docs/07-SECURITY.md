# 07 — Security & Compliance

## 1. Threat model & posture

- **Non-custodial, read-only.** The platform never holds private keys, never signs or broadcasts
  transactions, and cannot move funds. The worst-case breach exposes *read* portfolio data, not assets.
- It handles **sensitive financial data** (a company's crypto holdings and P/L), so confidentiality,
  integrity (auditable numbers), and access control are the priorities.

## 2. Authentication

- Email + password; passwords hashed with **bcrypt/argon2** (never stored or logged in plaintext).
- Session = signed, `httpOnly`, `SameSite=Lax`, `Secure` cookie (JWT/HMAC). Short-lived access with
  refresh, or rolling session. Edge-verifiable for route gating; DB-checked for fine-grained access.
- Optional **2FA (TOTP)** for owner/manager roles (Should-have). Invite-based onboarding with
  single-use, expiring tokens.
- Login throttling + lockout after repeated failures; audit every auth event.

## 3. Authorization (RBAC)

Org-scoped roles. The active `org_id` always comes from the session, never the request body.

| Capability | Owner | Manager | Analyst | Viewer/Accountant |
|------------|:-----:|:-------:|:-------:|:-----------------:|
| Manage org, members, roles, secrets | ✓ | — | — | — |
| Create/edit portfolios | ✓ | ✓ | — | — |
| Add/import/reverse transactions | ✓ | ✓ | — | — |
| Create/edit alerts | ✓ | ✓ | ✓ | — |
| View dashboards & valuations | ✓ | ✓ | ✓ | ✓ |
| Run/export reports | ✓ | ✓ | ✓ | ✓ |
| Acknowledge alerts | ✓ | ✓ | ✓ | ✓ |

- Enforced in middleware (route prefix/role) **and** re-checked per mutation against the resource's
  `org_id`/`portfolio_id` (defense in depth). Every list/read query is org-scoped.

## 4. Secret management (vault)

- Provider API keys (CMC, CryptoCompare), SMTP password, Slack/Telegram/webhook secrets are stored
  **AES-256-GCM encrypted at rest** in `settings` (or a dedicated `provider_keys`), never returned by
  the API (write-only; UI shows "set/not set").
- Master vault key from a secret manager / env (`VAULT_KEY`), generated on first boot if absent
  (file mode 0600). Rotatable.
- No secrets in the repo, logs, or client bundles. `.env`/data excluded from VCS.

## 5. Input validation & data integrity

- **Schema validation** (e.g. Zod) at every boundary; reject unknown fields.
- All DB access via **parameterized queries** / a query builder — no string concatenation.
- Money/quantity parsed as **Decimal** from validated strings; reject NaN/Inf/negative where invalid.
- The transaction ledger is **append-only**: financial fields are never updated; corrections are
  reversing entries. (Enforced in app; optionally a DB trigger blocking `UPDATE` on money columns.)
- CSV import is sanitized (cell-injection guard for `=,+,-,@` leading chars on export too), size-limited,
  and idempotent via `Idempotency-Key`/`external_ref`.

## 6. Web hardening

- HTTPS + HSTS; security headers: `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- **CSP** with per-request nonce; no `unsafe-inline` scripts; lock `connect-src` to self + price/FX hosts.
- CSRF protection on state-changing routes (SameSite + token for non-GET).
- **Rate limiting** (Redis sliding window) on auth, import, export, and price endpoints → `429`.
- No untrusted HTML rendering; sanitize any user-provided strings shown in reports.
- Outbound calls (price/webhook) use allowlists + timeouts; webhook targets validated to prevent SSRF
  to internal networks.

## 7. Auditability & retention

- **Audit log** for auth, member/role changes, portfolio/transaction mutations, alert changes, exports,
  and secret updates — actor, action, entity, IP, timestamp.
- Every monetary figure is reproducible from the immutable ledger + the `price_snapshot`/`fx_rate`
  used (stored `as_of`/source), so any report can be regenerated and defended.
- Configurable data-retention for price history (downsampling) and audit logs.

## 8. Privacy & compliance posture

- Data minimization: store only what's needed (no wallet keys, no KYC docs in MVP).
- Per-org data isolation; export & delete (GDPR-style) supported at org level.
- **Legal disclaimers (mandatory in UI + every report):** *CryptoTrack Biz provides informational
  portfolio tracking and analytics only. It is not investment, financial, accounting, or tax advice.
  Figures are estimates based on third-party market data and the user's own inputs and may be
  inaccurate or stale. Consult a qualified professional. Crypto assets are volatile and may lose value.*
- Cost-basis/tax-lot reports are **inputs for an accountant**, not filings; the chosen method and its
  jurisdictional suitability are the company's responsibility.

## 9. Operational security

- Least-privilege DB credentials; separate read replica for reporting.
- Secrets injected at runtime; images contain no secrets. Dependency and image scanning in CI.
- Backups of Postgres (ledger is the crown jewel) with tested restore; PITR where available.
- Health/readiness probes; alerting on worker staleness (no successful poll in X minutes).
