# 06 — Prices & Alerts

## Part A — Price feed

### Provider abstraction

A single interface, multiple implementations, selectable in settings:

```ts
interface PriceProvider {
  getPrices(assetIds: string[], vs: string): Promise<Record<string, {
    price: Decimal; change24h: number | null; marketCap?: number; asOf: string;
  }>>;
  getSeries(assetId: string, vs: string, range: string): Promise<Array<{ t: string; price: Decimal }>>;
  stream?(assetIds: string[], onTick: (id: string, price: Decimal) => void): () => void; // optional WS
}
```

| Provider | Key? | Notes |
|----------|------|-------|
| **CoinGecko** (default) | No | Generous keyless tier; `/simple/price` for spot, `/coins/{id}/market_chart` for history. Strict rate limits → cache hard. |
| CoinMarketCap | Yes | Higher limits, business-grade. |
| CryptoCompare | Yes | History + WS. |
| **Binance** | No (public) | Low-latency WS ticks for live dashboard (`<symbol>@ticker`). Spot pairs only. |

### Polling & caching

- The **worker** polls the union of assets held across all portfolios (plus assets referenced by
  enabled alerts), batched in one request where possible.
- **Interval:** configurable (default 60 s; floor enforced to respect provider limits). FX polled hourly.
- **Cache:** Redis `price:{assetId}:{vs}` with short TTL (e.g. 90 s) for hot reads; every successful
  poll also appends a row to `price_snapshots` (history + reproducible reports).
- **Degradation:** on provider error/limit → keep last-good value, mark `meta.source = "stale"` with the
  original `asOf`; circuit-breaker + exponential backoff; never throw into the poll loop.
- **Live UI:** optional Binance WS → publish ticks to Redis pub/sub → server SSE `event: price` to clients.

### History & retention

- High-resolution snapshots retained N days (e.g. 14), then downsampled hourly→daily for long-range charts.
- Portfolio value-over-time is computed by combining the held quantities at each point with the price
  series (or by snapshotting daily portfolio NAV in a `portfolio_nav` table for cheap charting).

## Part B — Alerts

### Alert types

| Kind | Trigger | Params |
|------|---------|--------|
| `price_above` | asset price ≥ threshold | asset, threshold, currency |
| `price_below` | asset price ≤ threshold | asset, threshold, currency |
| `pct_change` | % change over window crosses threshold (±) | asset, threshold(%), window(1h/24h/7d) |
| `portfolio_value` | portfolio total value crosses threshold | portfolio, threshold, direction |
| `pnl` | portfolio unrealized P/L (abs or %) crosses threshold | portfolio, threshold, mode(abs/pct) |

Each alert has: target scope (asset and/or portfolio), threshold, optional window, **channels**,
**cooldown** (minutes), enabled flag, creator.

### Evaluation loop (worker, after each price poll)

```
for each enabled alert:
  current = measure(alert)            // price | pct change | portfolio value | pnl
  if crossed(alert, current, lastState):
      key = cooldownKey(alert.id)
      if not redis.exists(key):
          event = record alert_event(observed=current, message=...)
          for ch in alert.channels: notify(ch, event)     // best-effort, per-channel try/catch
          redis.setex(key, alert.cooldownMin*60, 1)        // suppress floods
          publish SSE event: alert
      update lastState
```

- **Crossing semantics:** edge-triggered (fires on transition into the condition), not level-triggered,
  to avoid repeated firing while a condition persists. Combined with cooldown.
- **`pct_change`** compares the latest price against the price `window` ago from `price_snapshots`.
- Per-rule isolation: one failing rule/channel never blocks others or the poll loop.

### Notification channels

| Channel | Mechanism | Secret (vaulted) |
|---------|-----------|------------------|
| In-app | `alert_events` + SSE badge/toast + bell list | — |
| Email | SMTP (configurable) | SMTP password |
| Slack | Incoming webhook | webhook URL |
| Telegram | Bot `sendMessage` | bot token + chat id |
| Generic webhook | POST JSON to a URL | optional signing secret (HMAC) |

Message payload includes: alert name, asset/portfolio, observed value, threshold, direction, `as_of`,
and a deep link back into the app. Webhook payloads are HMAC-signed for verification.

### Reliability & UX

- Delivery results stored on `alert_events.channels` (sent/failed per channel) for an audit trail.
- "Test" button sends a sample to all configured channels.
- Users can **acknowledge** events; acknowledged events drop from the active bell list but stay in history.
- Quiet hours / digest mode (Should-have): batch non-critical alerts into a periodic summary.
