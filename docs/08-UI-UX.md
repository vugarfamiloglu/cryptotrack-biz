# 08 — UI / UX Specification

## 1. Design direction

**"Treasury Terminal"** — a calm, precise, finance-grade interface that reads as *trustworthy* rather
than *retail crypto*. Dense where it counts (numbers, tables), generous whitespace around the
narrative. A serious institutional palette, not neon.

- **Palette (dark default + light):** deep slate/ink base, a single disciplined brand accent
  (cool teal or indigo) for primary actions and the brand mark, and **semantic-only** color for money:
  green for gains, red for losses, amber for stale/alert. Money color is reserved exclusively for P/L
  signals so the eye trusts it.
- **Typography:** a precise grotesk for UI + a strong **tabular monospace** for all figures (so columns
  of numbers align and don't jitter as values tick). Display face for headings with character.
- **Signature element:** a live **portfolio "ticker tape"** / NAV header that updates in place (SSE),
  with a subtle pulse on change — the always-on heartbeat of the app. (Per the project convention of one
  signature live element + a distinct sidebar-collapse form.)
- **Layout:** left sidebar (nav) + sticky top bar (org/portfolio switcher, currency selector, live NAV
  badge, alerts bell, user) + main workbench. Light & dark themes, both intentional.

> Anti-template: this should look like a CFO's tool, not a generic SaaS dashboard. Hierarchy via scale
> contrast (huge NAV, quiet labels), tabular numerals, and restrained accenting.

## 2. Information architecture / navigation

```
Sidebar
 ├─ Dashboard            (org overview across portfolios)
 ├─ Portfolios           (list → detail)
 ├─ Transactions         (ledger, import)
 ├─ Alerts               (rules + fired history)
 ├─ Reports              (holdings, P/L, tax lots, exports)
 ├─ Activity / Audit
 └─ Settings             (org, currency, providers, channels, members)
Top bar: portfolio switcher · display-currency selector · LIVE NAV badge · alerts bell · theme · user
```

## 3. Key screens

### Dashboard (org-level)
- **Hero KPIs:** total value, 24h change (value + %), total unrealized P/L (value + %), realized P/L (period). Big tabular numbers, color = sign.
- **Value-over-time** line/area chart (range toggle 24h/7d/30d/90d/1y/all), display currency.
- **Allocation** donut by asset (and a second toggle by portfolio).
- **Portfolios table:** name, value, 24h %, unrealized P/L %, sparkline → row click to detail.
- **Top movers** (24h winners/losers) and **recent alerts** strip.
- Hover-data on charts; stale-price badge with `as of` when degraded.

### Portfolio detail
- Sub-header: portfolio value, P/L (unrealized + realized), cost basis, method badge.
- **Positions table** (the core): asset (icon+symbol), qty, avg cost, current price (+24h %), market
  value, cost basis, unrealized P/L (value + % ), allocation % — sortable, **resizable columns**,
  tabular numerals, color-coded P/L.
- Per-asset drill-down: lot list, contribution to P/L, price chart overlaid with buy/sell markers.
- Actions: add transaction, import, export, create alert for an asset.

### Transactions (ledger)
- Filterable table (asset, type, date range), append-only; "reverse" action instead of edit/delete.
- **Import wizard:** upload CSV → column mapping → preview with validation errors highlighted → confirm.
- Add-transaction modal: asset search, type, qty, unit price, currency, fee, date, note.

### Alerts
- Rules list (enabled toggle, scope, threshold, channels, cooldown) + create/edit modal.
- Fired-events feed with acknowledge; channel delivery status chips; "Send test".

### Reports
- Pick report (Holdings / P/L statement / Tax lots / Transactions), range, portfolio, currency, method.
- On-screen preview + export buttons (CSV / Excel / PDF). PDF is branded and carries the disclaimer.

### Settings
- Org (name, base currency, default cost-basis method), display preferences.
- **Providers:** price provider + interval; API keys (write-only, "set/not set" badges).
- **Channels:** SMTP / Slack / Telegram / webhook (vaulted secrets) + test buttons.
- **Members:** invite, role assignment, remove.

### Auth
- Login (password + show/hide eye toggle), invite acceptance, optional 2FA prompt.

## 4. Components & patterns

- `KpiTile`, `MoneyValue` (sign-aware color + tabular mono + currency), `PctBadge`, `Sparkline`,
  `AllocationDonut`, `ValueChart`, `PositionsTable` (resizable cols, sticky header), `LedgerTable`,
  `AlertRuleCard`, `ImportWizard`, `ExportMenu`, `ConfirmModal`, `PromptModal`, `Toaster`,
  `PasswordInput`, `LiveNavBadge` (SSE), `StaleBadge`.
- **Destructive actions** use a confirm modal (never native `confirm`); text inputs use a prompt modal.
- **Numbers:** always tabular-mono, right-aligned in tables, with thousands separators and the
  display-currency symbol; never lose decimal precision in formatting.

## 5. States (designed, not afterthoughts)

- **Loading:** skeletons for KPIs/tables/charts (no spinners flashing).
- **Empty:** no portfolios → guided "create your first portfolio / import a CSV"; no transactions →
  add/import prompt; no alerts → suggested templates (e.g. "BTC ±15% / 24h").
- **Error:** clear, recoverable messages; price degraded → labeled stale, not blank.
- **Live:** value updates animate in place; alert toast + bell increment on SSE `alert`.

## 6. Charts

- Chart.js (or Recharts): value-over-time (area), allocation (donut), price + trade markers (line),
  P/L distribution (bar). Hover tooltips with exact figures + `as of`. Respect reduced-motion.

## 7. Accessibility & responsive

- WCAG 2.1 AA: contrast on money colors verified; **never color-only** — pair with ▲/▼ and sign.
- Full keyboard nav, visible focus, ARIA on tables/charts (data table fallback for charts).
- Responsive 320 → 1920; tables become stacked cards on mobile; sticky NAV header persists.
- `prefers-reduced-motion` honored for the live pulse and chart animations.
