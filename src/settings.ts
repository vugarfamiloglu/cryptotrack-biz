import db from "./db.js";
import { encryptSecret, decryptSecret } from "./vault.js";

export const SECRET_KEYS = ["smtp_password", "slack_webhook", "telegram_token", "webhook_secret", "coingecko_api_key", "cmc_api_key"];

const getRow = db.prepare("SELECT value, encrypted FROM settings WHERE org_id=? AND key=?");
const upsert = db.prepare(`INSERT INTO settings (org_id, key, value, encrypted, updated_at) VALUES (?,?,?,?,datetime('now'))
  ON CONFLICT(org_id, key) DO UPDATE SET value=excluded.value, encrypted=excluded.encrypted, updated_at=datetime('now')`);

export function getSetting(orgId: string, key: string, envKey?: string): string {
  const row = getRow.get(orgId, key) as { value: string; encrypted: number } | undefined;
  if (row && row.value) return row.encrypted ? decryptSecret(row.value) : row.value;
  if (envKey && process.env[envKey]) return process.env[envKey] as string;
  return "";
}
export function setSetting(orgId: string, key: string, value: string): void {
  const secret = SECRET_KEYS.includes(key);
  upsert.run(orgId, key, secret && value ? encryptSecret(value) : value, secret ? 1 : 0);
}
export function publicSettings(orgId: string) {
  const org = db.prepare("SELECT name, base_currency, cost_basis_method FROM organizations WHERE id=?").get(orgId) as any;
  const hasSecret = Object.fromEntries(SECRET_KEYS.map((k) => [k, Boolean(getSetting(orgId, k))]));
  return {
    org,
    priceProvider: getSetting(orgId, "price_provider", "PRICE_PROVIDER") || "coingecko",
    pollSeconds: Number(getSetting(orgId, "poll_seconds", "PRICE_POLL_SECONDS") || 60),
    slackOn: Boolean(getSetting(orgId, "slack_webhook")),
    hasSecret,
  };
}
